import * as utils from './utils'
import * as influx from './influx_helper'
import * as insert_actions from './insertion_actions_ctrl'
import * as edit_actions from './editing_actions_ctrl'
import * as dp from './data_processor'
import * as cons from './constans'
import moment from 'moment'
import * as chart from './chart_option'

let _order
let _orderStates
const closeForm = () => $('a#product-schedule-gantt-chart-order-actions-close-btn').trigger('click')

export function showOrderActions(order){
  //set the order passed in global
  _order = order

  //check if the order is available for editing, only 'planned' and 'ready' can be edited by scheduler
  if (order.status !== cons.STATE_PLAN && order.status !== cons.STATE_READY) {
    utils.alert('warning', 'Warning', 'The order status is ' + order.status + ', so it is no longer available for editing')
    return
  }

  //pop up the actions form
  utils.showModal('order_actions.html', {})

  //set listeners
  removeListeners()
  addListeners()
}

function removeListeners(){
  $(document).off('click', 'input[type="radio"][name="product-schedule-gantt-chart-order-actions-radio"]')
}

function addListeners(){
  $(document).on('click', 'input[type="radio"][name="product-schedule-gantt-chart-order-actions-radio"]', e => {
    if (e.target.id === 'insert') {
      insertOrder()
    }else if (e.target.id === 'edit') {
      editOrder()
    }else if (e.target.id === 'release') {
      if (_order.status === cons.STATE_READY) {
        utils.alert('warning', 'Warning', 'Order has already been released')
        closeForm()
      }else{
        updateOrderStatus(cons.STATE_READY)
      }
    }else if (e.target.id === 'delete') {
      updateOrderStatus(cons.STATE_DELETED)
    }
  })
}

async function insertOrder(){
  const url = `${utils.postgRestHost}order_state`
  const result = await utils.sure(utils.get(url))
  if (result.ok) {
    _orderStates = result.data
    insert_actions.showActions(_order)
  }else {
    utils.alert('error', 'Error', `Error occurred when getting the Order State Configuration due to ${result.error} please try again or contact the dev team`)
  }
}

async function editOrder(){
  const url = `${utils.postgRestHost}order_state`
  const result = await utils.sure(utils.get(url))
  if (result.ok) {
    _orderStates = result.data
    edit_actions.showActions(_order)
  }else {
    utils.alert('error', 'Error', `Error occurred when getting the Order State Configuration due to ${result.error} please try again or contact the dev team`)
  }
}

export function getOrderStates(){
  return _orderStates
}

function updateOrderStatus(status){
  const line = influx.writeLineForUpdate(status, _order)
  if (status === 'Deleted') {
    deleteCurrentAndUpdateAffectOrders(line)
  }else {
    utils.post(influx.writeUrl, line).then(res => {
      utils.alert('success', 'Success', 'Order has been marked as ' + status)
      closeForm()
      chart.refreshDashboard()
    }).catch(e => {
      utils.alert('error', 'Database Error', 'An error occurred while updating the order : ' + e)
      closeForm()
    })
  }
}


function deleteCurrentAndUpdateAffectOrders(line){
  //create promises array and put the 'delete current order request' into it first
  let promises = [utils.post(influx.writeUrl, line)]

  //get all orders data for further filtering
  const allData = dp.getData()

  //filter affected orders using all orders data
  //affected orders = order.startTime >= thisOrder.endtime && in the same line && with the same date.
  const affectedOrders = allData.filter(order => order.startTime >= _order.endTime && order.production_line === _order.production_line && order.order_date === _order.order_date)
  
  //work out thisOrder's total duration, which = its duration + its changeover duration
  const deletingOrderDurationHour = moment.duration(_order.order_qty / (_order.planned_rate * 60), 'hours') 
  const deletingOrderChangeover = moment.duration(_order.planned_changeover_time, 'H:mm:ss')
  const deletingOrderTotalDur = deletingOrderDurationHour.add(deletingOrderChangeover)
  
  //loop affected orders, order's starttime and endtime should both subtract the total duration worked out
  affectedOrders.forEach(order => {
    const line = influx.writeLineForTimeUpdate(order, deletingOrderTotalDur, 'subtract')
    promises.push(utils.post(influx.writeUrl, line))
  })

  Promise.all(promises).then(() => {
    utils.alert('success', 'Success', 'Order has been marked as Deleted')
    closeForm()
    chart.refreshDashboard()
  }).catch(e => {
    utils.alert('error', 'Database Error', 'An error occurred while deleting the order : ' + e)
    closeForm()
  })
}