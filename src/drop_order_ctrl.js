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
  //if is over 24?
  const allData = dp.getData()
  const timeAlreadyTaken = getTimeAlreadyTaken(allData, _targetOrder)
  
  if (isOver24Hours(timeAlreadyTaken, _droppingOrder)) {
    utils.alert('warning', 'Warning', "There is no spare space for this order to fit in this date's schedule")
    return
  }

  //get dropping order's total duration
  const droppingTotalDuration = getOrderDuration(_droppingOrder)

  if (isLineChanged(_droppingOrder, _targetOrder)) {
    //line changed
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
  //then ori affected ----- dropping dur
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

function getInitStartTime(order){
  const startTime = moment(order.startTime)
  const changeover = moment.duration(order.planned_changeover_time, 'H:mm:ss')
  return startTime.subtract(changeover)
}

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

function isLineChanged(droppingOrder, targetingOrder){
  return droppingOrder.production_line !== targetingOrder.production_line
}

function isMovingForward(droppingOrder, targetOrder) {
  return droppingOrder.startTime < targetOrder.startTime
}

/**
 * Check if the order is over 24 hours, return true if it is.
 * @param {*} time The total time that has already been taken on that line and that date
 */
function isOver24Hours(time, droppingOrder){
  const hours24 = moment.duration(24,'hours').valueOf()

  const duration = moment.duration(droppingOrder.order_qty / droppingOrder.planned_rate, 'hours')
  const changeover = moment.duration(droppingOrder.planned_changeover_time, 'H:mm:ss')
  const totalDur = duration.add(changeover)
  const totalTime = time + totalDur.valueOf()  
  
  return totalTime > hours24
}

/**
 * The alldata and the user input the calculate the time in the line that the editing order is going to go to
 * return the total time that has been taken.
 * @param {*} allData All the orders that is being passed in and displayed in this panel
 */
function getTimeAlreadyTaken(allData, targetOrder){
  const ordersWithSameLineAndDate = allData.filter(order => order.production_line === targetOrder.production_line && order.order_date === targetOrder.order_date)
  const ordersThatCount = ordersWithSameLineAndDate.filter(order => order.order_id !== _droppingOrder.order_id)

  if (ordersThatCount.length === 0) { return 0 }

  let sumOfTime = 0
  ordersThatCount.forEach(order => {
    const changeover = moment.duration(order.planned_changeover_time, 'H:mm:ss')
    const duration = moment.duration((order.order_qty / order.planned_rate), 'hours')
    const total = changeover.add(duration).valueOf()
    sumOfTime += total
  })
  
  return sumOfTime
}