import * as utils from './utils'
import * as influx from './influx_helper'
import * as dp from './data_processor'
import * as instant_search from './instant_search_ctrl'
import moment from 'moment'
import * as chart from './chart_option'

let _isInsertingBefore
let _droppingOrder
let _targetOrder

const closeForm = () => $('a#product-schedule-gantt-chart-drop-insert-actions-close-btn').trigger('click')

export function showForm(droppingOrder, targetOrder) {
  _droppingOrder = droppingOrder
  _targetOrder = targetOrder

  //show form
  utils.showModal('drop_insert_actions.html', {droppingOrder: droppingOrder, targetOrder: targetOrder})

  removeListeners()
  addListeners()
}

function removeListeners(){
  $(document).off('click', 'input[type="radio"][name="product-schedule-gantt-chart-drop-insert-actions-radio"]')
}

function addListeners(){
  $(document).on('click', 'input[type="radio"][name="product-schedule-gantt-chart-drop-insert-actions-radio"]', e => {
    if (e.target.id === 'before') {
      _isInsertingBefore = true
      insert()
    }else if (e.target.id === 'after') {
      _isInsertingBefore = false
      insert()
    }else if (e.target.id === 'cancel') {
      closeForm()
    }
  })
}

function insert(){
  const allData = dp.getData()

  //get dropping order's total duration
  const droppingTotalDuration = getOrderDuration(_droppingOrder)
  
  if (!isLineHavingSpareTimeForTheDay(allData, droppingTotalDuration, _targetOrder)) {
    utils.alert('warning', 'Warning', "There is no spare space for this order to fit in this date's schedule")
    return
  }

  if (isLineChanged(_droppingOrder, _targetOrder)) {
    //find original affected orders (orders that are after the dropping order in the ori line)
    //then find targetting affected orders (orders that are after the place that the dropping order is going to take)
    const originalLineAffectedOrders = findAffectedOrdersInLineChangedCase(allData, _droppingOrder, true)
    const targetingLineAffectedOrders = findAffectedOrdersInLineChangedCase(allData, _targetOrder, false)

    updateForLineChangedCase(originalLineAffectedOrders, targetingLineAffectedOrders, droppingTotalDuration)
    
  }else {
    //line didn't change
    //need to know if the dragging order is moving forward or backward
    const ordersAffected = findAffectedOrders(allData, _droppingOrder ,_targetOrder, isMovingForward(_droppingOrder, _targetOrder))

    //if orders affected === 0, meaning that the targeting position is next the dropping position
    //and the user insert the dropping order to the same direction where the dropping order is in
    if (ordersAffected.length === 0) {
      const dir = _isInsertingBefore ? "before " : "after "
      const text = "Order " + _droppingOrder.order_id + " is already " + dir + "the order " + _targetOrder.order_id      
      utils.alert('warning', 'Warning', text)
      return
    }

    //get duration
    const affectedOrdersTotalDuration = getTotalOrderDuration(ordersAffected)

    //start update orders to influxdb
    update(isMovingForward(_droppingOrder, _targetOrder), droppingTotalDuration, affectedOrdersTotalDuration, ordersAffected)

  }
}

function updateForLineChangedCase(oriOrders, targOrders, dropDur){
    //if left, dropping start time = target start time
    //then target affected +++++ dropping dur
    //then ori affected ----- dropping dur
    let newDroppingStartTime
    if (_isInsertingBefore) {
      newDroppingStartTime = getInitStartTime(_targetOrder)  
      newDroppingStartTime.add(moment.duration(_droppingOrder.planned_changeover_time, 'H:mm:ss'))    
    }else{
      newDroppingStartTime = moment(_targetOrder.endTime)
      newDroppingStartTime.add(moment.duration(_droppingOrder.planned_changeover_time, 'H:mm:ss'))
    }

    //Get new dropping order's start time value and end time value
    const sVal = newDroppingStartTime.valueOf()
    const eVal = newDroppingStartTime.add(moment.duration(dropDur.valueOf())
      .subtract(moment.duration(_droppingOrder.planned_changeover_time, 'H:mm:ss'))).valueOf()

    const line = influx.writeLineForUpdateDragging(_droppingOrder, sVal, eVal, _targetOrder.production_line)
    
    utils.post(influx.writeUrl, line).then(res => {
      updateOriginOrdersForLineChangedCase(oriOrders, dropDur, targOrders)
    }).catch(e => {
      closeForm()
      utils.alert('error', 'Error', 'An error occurred when updated the order : ' + e)
    })    
}

function updateOriginOrdersForLineChangedCase(oriOrders, dropDur, targOrders){
  if (oriOrders.length === 0) {
    updateTargetOrdersForLineChangedCase(targOrders, dropDur)
  }

  let promises = []
  oriOrders.forEach(order => {
    const line = influx.writeLineForTimeUpdate(order, dropDur, 'subtract')
    promises.push(utils.post(influx.writeUrl, line))
  })
  Promise.all(promises).then(res => {
    updateTargetOrdersForLineChangedCase(targOrders, dropDur)
  }).catch(e => {
    closeForm()
    utils.alert('error', 'Error', 'An error occurred when updated the order : ' + e)
  })
}

function updateTargetOrdersForLineChangedCase(targOrders, dropDur){
  if (targOrders.length === 0) {
    closeForm()
    utils.alert('success', 'Successful', 'Order has been successfully updated')
    chart.refreshPanel()
  }
  //then target affected +++++ dropping dur
  let promises = []
  targOrders.forEach(order => {
    const line = influx.writeLineForTimeUpdate(order, dropDur, 'add')
    promises.push(utils.post(influx.writeUrl, line))
  })
  Promise.all(promises).then(res => {
    closeForm()
    utils.alert('success', 'Successful', 'Order has been successfully updated')
    chart.refreshPanel()
  }).catch(e => {
    closeForm()
    utils.alert('error', 'Error', 'An error occurred when updated the order : ' + e)
  })
}

function update(isMovingForward, droppingDur, affectedDur, affectedOrders){
  if (isMovingForward) {
    //if forward, dropping order +++++ all affected orders' total dur changeovers included
    const line = influx.writeLineForTimeUpdate(_droppingOrder, affectedDur, 'add')
    utils.post(influx.writeUrl, line).then(res => {
      updateAffectedOrders(affectedOrders, droppingDur, isMovingForward)
    }).catch(e => {
      closeForm()
      utils.alert('error', 'Error', 'An error occurred when updated the order : ' + e)
    })
  }else{
    //if backward and inserting before, dropping order ----- all affected orders' total dur changeovers included
    const line = influx.writeLineForTimeUpdate(_droppingOrder, affectedDur, 'subtract')
    utils.post(influx.writeUrl, line).then(res => {
      updateAffectedOrders(affectedOrders, droppingDur, isMovingForward)
    }).catch(e => {
      closeForm()
      utils.alert('error', 'Error', 'An error occurred when updated the order : ' + e)
    })
  }
}

function updateAffectedOrders(affectedOrders, droppingDur, isMovingForward){
  let promise = []

  if (isMovingForward) {
    //all affected orders ----- dropping total dur
    affectedOrders.forEach(order => {
      const line = influx.writeLineForTimeUpdate(order, droppingDur, 'subtract')
      promise.push(utils.post(influx.writeUrl, line))
    })
  }else {
    //all affected orders ++++++ dropping total dur
    affectedOrders.forEach(order => {
      const line = influx.writeLineForTimeUpdate(order, droppingDur, 'add')
      promise.push(utils.post(influx.writeUrl, line))
    })
  }

  Promise.all(promise).then(res => {
    closeForm()
    utils.alert('success', 'Successful', 'Order has been successfully updated')
    chart.refreshPanel()
  }).catch(e => {
    closeForm()
    utils.alert('error', 'Error', 'An error occurred when updated the order : ' + e)
  })
}

/**
 * Calculate an order's total duration, then return the duration that is moment duration obj
 * @param {Obj} order The order obj
 */
function getOrderDuration(order){
  const targetOrderStartTime = getInitStartTime(order)
  const targetOrderEndTime = moment(order.endTime)
  return moment.duration(targetOrderEndTime.diff(targetOrderStartTime))
}

/**
 * Calculate an array of orders' total duration, then return the duration that is moment duration obj
 * @param {Obj} ordersAffected The array of obj
 */
function getTotalOrderDuration(ordersAffected){
  let duration = moment.duration(0)
  ordersAffected.forEach(order => {
    duration.add(getOrderDuration(order))
  })
  return duration
}

/**
 * Return the order's original start time
 * Oringal start time === The order's actual start time - the order's changeover
 * @param {*} order The order needed to be calculated
 */
function getInitStartTime(order){
  const startTime = moment(order.startTime)
  const changeover = moment.duration(order.planned_changeover_time, 'H:mm:ss')
  return startTime.subtract(changeover)
}

/**
 * This is for the case that the dropping order is dropped to another production line
 * Find affected orders for dropping line or targeting line based on the last param passed in.
 * Return the affected orders.
 * @param {*} allData All orders
 * @param {*} order The dropping order || or the targeting order
 * @param {*} isOriginal Is finding affected orders for the original line(true)? or the targeting line(false)?
 */
function findAffectedOrdersInLineChangedCase(allData, order, isOriginal){
  const ordersWithSameLineAndDate = allData.filter(or => or.production_line === order.production_line && or.order_date === order.order_date)
  let ordersBeingAffected = ordersWithSameLineAndDate.filter(or => or.startTime > order.startTime)
  if (_isInsertingBefore) {
    if (!isOriginal) {
      ordersBeingAffected.push(order)
    }
  }
  return ordersBeingAffected
}

/**
 * This is for the case that the dropping order is dropped on the same line
 * Return the affected orders
 * @param {*} allData All orders
 * @param {*} droppingOrder The dropping order
 * @param {*} targetingOrder The order the dropping order is dropped on
 * @param {*} isMovingForward Is the dropping order going forward?
 */
function findAffectedOrders(allData, droppingOrder, targetingOrder, isMovingForward) {
  const ordersWithSameLineAndDate = allData.filter(order => order.production_line === targetingOrder.production_line && order.order_date === targetingOrder.order_date)
  let ordersBeingAffected = ordersWithSameLineAndDate.filter(order => {
    let targetingStartTime = moment(targetingOrder.startTime)
    let droppingStartTime = moment(droppingOrder.startTime)
    if (isMovingForward) {
      return order.startTime > droppingStartTime.valueOf() && order.startTime < targetingStartTime
    }else{
      return order.startTime < droppingStartTime.valueOf() && order.startTime > targetingStartTime
    }
  })
  if (!_isInsertingBefore) {
    if (isMovingForward) { ordersBeingAffected.push(targetingOrder) }
  }else{
    if (!isMovingForward) { ordersBeingAffected.push(targetingOrder) }
  }
  return ordersBeingAffected
}

/**
 * Check if the dropping order and the target order is in the same line
 * Return true if they are NOT in a same line
 * @param {*} droppingOrder The order the user is dropping
 * @param {*} targetingOrder The order the dropping order is dropped on
 */
function isLineChanged(droppingOrder, targetingOrder){
  return droppingOrder.production_line !== targetingOrder.production_line
}

/**
 * Return true if the dropping order has gone forward, otherwise false.
 * @param {*} droppingOrder The dropping order
 * @param {*} targetOrder The order that the dropping order is dropped on
 */
function isMovingForward(droppingOrder, targetOrder) {
  return droppingOrder.startTime < targetOrder.startTime
}

/**
 * Check if the targeting line on that date has spare space for the dropping order to fit in
 * Return true if there is space for the dropping order, otherwise false.
 * @param {*} allData The orders
 * @param {*} droppingTotalDuration The dropping order
 * @param {*} targetOrder The order that the dropping order is dropped on
 */
function isLineHavingSpareTimeForTheDay(allData, droppingTotalDuration, targetOrder){

  //all orders in the targeting line
  const affectedOrders = allData.filter(order => order.production_line === targetOrder.production_line && order.order_date === targetOrder.order_date)
  //get the max end time
  const all_end_times = affectedOrders.map(order => order.endTime)
  const maxEndTime = moment(Math.max(...all_end_times))  
  //find the line's default start time and then plus next day
  const targetDay = moment(targetOrder.order_date, 'YYYY-MM-DD')
  const nextDay = targetDay.add(1, 'days').format('YYYY-MM-DD')
  const nextDayStartTime = moment(nextDay + ' ' + utils.getLineStartTime(targetOrder.production_line), 'YYYY-MM-DD H:mm:ss')
  //maxtime + dropping dura to calc the final max time
  maxEndTime.add(droppingTotalDuration)

  return maxEndTime.isSameOrBefore(nextDayStartTime)
}