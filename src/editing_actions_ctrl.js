import * as utils from './utils'
import * as influx from './influx_helper'
import * as dp from './data_processor'
import * as instant_search from './instant_search_ctrl'
import moment from 'moment'
import * as chart from './chart_option'

let _targetOrder
let _ordersBeingAffected
let _tryCatchCounter = 1
let _products
let _equipment

const closeForm = () => $('a#product-schedule-gantt-chart-order-form-close-btn').trigger('click')

/**
 * Show edition order form
 * @param {*} targetOrder The order that the user want to make edition on
 */
export function showActions(targetOrder){
  
  _targetOrder = targetOrder

  //get products data and equipment from postgres database
  getProductsAndEquipment(callback)

  function callback(){

    utils.showModal('order_form.html', {})

    //try initialize the form
    _tryCatchCounter = 1
    tryInitialisingForm()

    //set listeners
    removeListeners()
    addListeners()
  }

}

function tryInitialisingForm(){
  setTimeout(() => {
    try{
      initialiseForm()
    }catch(e){
      if (_tryCatchCounter < 15) {
        //maximunm re-init the form over 15 times
        initialiseForm()
        _tryCatchCounter++
      }else{
        closeForm()
        utils.alert('error', 'Error', 'Form initialisation failed, please try agian : ' + e)
      }
    }
  }, 200);
}

function initialiseForm(){
  //init the instant search function
  instant_search.enableInstantSearch(_products, _equipment)

  //init datepicker
  $('#datepicker').datepicker({
    orientation: 'top',
    todayBtn: 'linked',
    format: 'yyyy-mm-dd',
    autoclose: true,
  })

  //init timepicker
  $('#changeover-minutes-picker').timepicker({
    showMeridian: false,
    showSeconds: true,
    maxHours: 100,
    minuteStep: 1,
    secondStep: 1,
    defaultTime: '00:00:00',
    icons: {
        up: 'fa fa-chevron-up',
        down: 'fa fa-chevron-down'
    }
  })

  //prefill date field and production line
  prefill()
}

function prefill(){
  $('input.prod-sche-gt-chart-datalist-input#order-id').val(_targetOrder.order_id)
  $('input.prod-sche-gt-chart-datalist-input#order-qty').val(_targetOrder.order_qty)
  $('input.prod-sche-gt-chart-datalist-input#datalist-input-production-line').val(_targetOrder.production_line)
  $('input.prod-sche-gt-chart-datalist-input#datalist-input-production-line').attr('readonly', false)
  $('i.prod-sche-gt-chart-dl-i#datalist-icon').show()
  $('input.prod-sche-gt-chart-datalist-input#datalist-input-products').val(_targetOrder.product_id + ' | ' + _targetOrder.product_desc)
  $('input.prod-sche-gt-chart-datalist-input#datepicker').val(_targetOrder.order_date)
  $('input.prod-sche-gt-chart-datalist-input#datepicker').attr('readonly', false)
  $('input.prod-sche-gt-chart-datalist-input#planned-rate').val(_targetOrder.planned_rate)
  $('input.prod-sche-gt-chart-datalist-input#changeover-minutes-picker').val(_targetOrder.planned_changeover_time)
  updateDuration(_targetOrder.order_qty, _targetOrder.planned_rate)
}

function removeListeners(){
  $(document).off('input', 'input#planned-rate, input#order-qty')
  $(document).off('click', 'button#product-schedule-gantt-chart-order-form-submitBtn')
}

function addListeners(){
  $(document).on('input', 'input#planned-rate, input#order-qty', () => {
    let data = $('form#product-schedule-gantt-chart-order-form').serializeArray()
    updateDuration(data[1].value, data[5].value)
  })

  $(document).on('click', 'button#product-schedule-gantt-chart-order-form-submitBtn', e => {
    let data = $('form#product-schedule-gantt-chart-order-form').serializeArray()
    submitOrder(data)
  })
}

function submitOrder(data) {

  const inputValues = {
    orderId: data[0].value, 
    orderQty: data[1].value, 
    productionLine: data[2].value, 
    product: data[3].value, 
    date: data[4].value, 
    plannedRate: data[5].value,
    duration: data[6].value,
    changeover: data[7].value,
    startTime: _targetOrder.startTime,
    endTime: _targetOrder.endTime,
  }

  if (isValueValid(inputValues)) {
    updateOrder(inputValues)
  }
}

function updateOrder(inputValues){

  const allData = dp.getData()

  //the orders that are in the original line that this order was in and that are being affected because this order changes line
  const ordersBeingAffected = getOrdersBeingAffect(allData, inputValues)  
  _ordersBeingAffected = ordersBeingAffected
  //the time (in milsec format) that has already been taken for the line and date that this order is going to
  const timeAlreadyTaken = getTimeAlreadyTaken(allData, inputValues)

  if (isOver24Hours(timeAlreadyTaken, inputValues)) {
    utils.alert('warning', 'Warning', "There is no spare space for this order to fit in this date's schedule")
    return
  }
  
  //there is no order yet on the line on that date, check for tags changes then update
  if (isTagsChanged(inputValues)) {

    updateOldAndNewOrders(inputValues)
    
  }else {
    //in here, check if the line has changed, if yes, meaning that the order is going to another line
    //so also update all affectingOrders(orders that are in the original line and that are after this order)
    if (isLineChanged(inputValues)) {
      //save the order directly with removing its starttime and endtime to let the initialiser to init it again
      //coz it is changing line, so just simply remove the start time and end time
      updateWithRemoving(inputValues)
    }else{
      //save the order directly with changing its starttime and endtime
      updateWithChanging(inputValues)
    }
  }
}

/**
 * The alldata and the user input the calculate the time in the line that the editing order is going to go to
 * return the total time that has been taken.
 * @param {*} allData All the orders that is being passed in and displayed in this panel
 * @param {*} inputValues Inputs that the user entered in this order edition form
 */
function getTimeAlreadyTaken(allData, inputValues){
  const ordersWithSameLineAndDate = allData.filter(order => order.production_line === inputValues.productionLine && order.order_date === inputValues.date)
  const ordersThatCount = ordersWithSameLineAndDate.filter(order => order.order_id !== _targetOrder.order_id)

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

/**
 * get alldata and the user input to filter all affected orders.
 * These orders will be the ones that are in the original line with the same date.
 * @param {*} allData All the orders that is being passed in and displayed in this panel
 * @param {*} inputValues Inputs that the user entered in this order edition form
 */
function getOrdersBeingAffect(allData, inputValues){
  const ordersInOriginalLineAndDate = allData.filter(order => order.production_line === _targetOrder.production_line && order.order_date === _targetOrder.order_date)
  return ordersInOriginalLineAndDate.filter(order => {
    let endTime = moment(inputValues.endTime)
    return order.startTime >= endTime.valueOf()
          && order.order_date === inputValues.date
  })
}

/**
 * Compares the user input and the original order to see if the line has been changed.
 * return true if it is.
 * @param {*} inputValues The user input
 */
function isLineChanged(inputValues){
  return inputValues.productionLine !== _targetOrder.production_line
}

/**
 * Take the user input, send request to change the current order to be what the user has entered in the edition form
 * It will remove the order's start time and end time because it is changing line so that no order will be affected in the changing line
 * and so that the start time and end time can be removed, and then let the initialiser to init the time again.
 * @param {*} inputValues The user input
 */
function updateWithRemoving(inputValues){
  const line = influx.writeLineForUpdateWithRemovingTime(inputValues, _targetOrder.status)
  utils.post(influx.writeUrl, line).then(res => {
    if (_ordersBeingAffected.length > 0) {
      const difference = getDiff(inputValues)
      updateAffectedOrders(inputValues, difference)
    }else {
      closeForm()
      utils.alert('success', 'Successful', 'Order has been successfully updated')
      chart.refreshPanel()
    }
  }).catch(e => {
    closeForm()
    utils.alert('error', 'Error', 'An error occurred when updated the order : ' + e)
  })
}

/**
 * Take the user input, send request to change the current order to be what the user has entered in the edition form
 * It normally changes the current order's starttime and endtime because the order is being changed
 * @param {*} inputValues User input
 */
function updateWithChanging(inputValues) {
  const originalStartTime = _targetOrder.startTime
  //The difference between the original changeover and the edited changeover
  const changeoverDiff = moment.duration(inputValues.changeover).subtract(moment.duration(_targetOrder.planned_changeover_time))
  const startTime = moment(originalStartTime).add(changeoverDiff)
  const duration = moment.duration(inputValues.orderQty / inputValues.plannedRate, 'hours')
  const endTime = moment(originalStartTime).add(changeoverDiff).add(duration)

  //calc the difference between the edited order's total duration and the original order's total duration
  //so that all the affected orders know how many to add/subtract
  const oldTotal = moment.duration(_targetOrder.order_qty / _targetOrder.planned_rate, 'hours').add(moment.duration(_targetOrder.planned_changeover_time))
  const newTotal = duration.add(moment.duration(inputValues.changeover))
  const difference = oldTotal.subtract(newTotal)
  
  const line = influx.writeLineForUpdateWithChangingTime(inputValues, _targetOrder.status, startTime.valueOf(), endTime.valueOf())
  utils.post(influx.writeUrl, line).then(res => {
    updateAffectedOrders(inputValues, difference)
  }).catch(e => {
    closeForm()
    utils.alert('error', 'Error', 'An error occurred when updated the order : ' + e)
  })
}

/**
 * Take the time difference, send request to add/subtract the time diff for all the affected orders due to -
 * the edited order being changed or removed from the current line and date
 * @param {*} inputValues The user input
 * @param {*} difference The time difference that all affected orders will need to add/subtract
 */
function updateAffectedOrders(inputValues, difference) {
  let promises = []
  _ordersBeingAffected.forEach(order => {
    const line = influx.writeLineForTimeUpdate(order, difference, 'subtract')
    const prom = utils.post(influx.writeUrl, line)
    promises.push(prom)
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

/**
 * Take inputValues and find the qty and rate to calc the duration
 * then return duration + changeover duration
 * @param {*} inputValues User input for the form
 */
function getDiff(inputValues){
  let diff
  const duration = moment.duration(inputValues.orderQty / inputValues.plannedRate, 'hours')
  const changeover = moment.duration(inputValues.changeover, 'H:mm:ss')
  diff = duration.add(changeover)
  return diff
}

function updateOldAndNewOrders(inputValues){
  const line = influx.writeLineForUpdate('Replaced', _targetOrder)
  utils.post(influx.writeUrl, line).then(res => {
    //save the new order directly with removing its starttime and endtime to let the initialiser to init it again
    //becuase this is the first
    if (isLineChanged(inputValues)) {
      updateWithRemoving(inputValues)
    }else {
      updateWithChanging(inputValues)
    }
  }).catch(e => {
    closeForm()
    utils.alert('error', 'Error', 'An error occurred when updated the order : ' + e)
  })
}

/**
 * Check if the order is over 24 hours, return true if it is.
 * @param {*} time The total time that has already been taken on that line and that date
 */
function isOver24Hours(time, inputValues){
  const hours24 = moment.duration(24,'hours').valueOf()

  const duration = moment.duration(inputValues.orderQty / inputValues.plannedRate, 'hours')
  const changeover = moment.duration(inputValues.changeover, 'H:mm:ss')
  const totalDur = duration.add(changeover)
  const totalTime = time + totalDur.valueOf()
  
  return totalTime > hours24
}

/**
 * Return treu if the user has changed the order date
 * @param {*} inputValues The users input for this form editing
 */
function isDateChanged(inputValues){
  return inputValues.date !== _targetOrder.order_date 
}

/**
 * Return true if the user has changed tag values (order_id, product_id, product_desc)
 * @param {*} inputValues The users input for this form editing
 */
function isTagsChanged(inputValues){
  const product_id = inputValues.product.split(' | ')[0]
  const product_desc = inputValues.product.split(' | ')[1]
  
  return (
    _targetOrder.order_id !== inputValues.orderId
    || _targetOrder.product_id !== product_id
    || _targetOrder.product_desc !== product_desc
  )
}

/**
 * Expect the user inputs
 * Check if the user inputs are valid
 * Stop and prompt error if the inputs are not valid
 * @param {*} data 
 */
function isValueValid(data) {

  const dateRegExp = new RegExp('^[0-9]{4}-(((0[13578]|(10|12))-(0[1-9]|[1-2][0-9]|3[0-1]))|(02-(0[1-9]|[1-2][0-9]))|((0[469]|11)-(0[1-9]|[1-2][0-9]|30)))$')
  const prodList = _products.reduce((arr, p) => {
    const str = p.product_id + ' | ' + p.product_desc
    arr.push(str)
    return arr
  }, [])

  let productionLineList = _equipment.reduce((arr, equ) => {
    arr.push(equ.site + ' | ' + equ.area + ' | ' + equ.production_line)
    return arr
  }, [])  
  productionLineList = utils.findDistinct(productionLineList)

  if (data.orderId === '') {
    utils.alert('warning', 'Warning', 'Order Number Empty, please enter the Order Number')
    return false
  }

  if (data.orderQty === '') {
    utils.alert('warning', 'Warning', 'Order Quantity Empty, please enter the Order Quantity')
    return false
  }

  if (data.productionLine === '') {
    utils.alert('warning', 'Warning', 'Production Line Empty, please enter the Production Line')
    return false
  }else {
    if (productionLineList.indexOf(data.productionLine) === -1) {
      utils.alert('warning', 'Warning', 'Production Line Not Exist, please select a Production Line from the Production Line List')
      return false
    }
  }

  if (data.product === '') {
    utils.alert('warning', 'Warning', 'Product Empty, please enter the Product')
    return false
  }else {
    if (prodList.indexOf(data.product) === -1) {
      utils.alert('warning', 'Warning', 'Product Not Exist, please select a Product from the Product List')
      return false
    }
  }

  if (!dateRegExp.test(data.date)) {
    utils.alert('warning', 'Warning', 'Scheduled Start Date Empty or Invalid Date Format, please choose a date from the date picker')
    return false
  }

  if (data.plannedRate === '') {
    utils.alert('warning', 'Warning', 'Planned Rate Empty, please enter the Planned Rate')
    return false
  }

  return true
}

function updateDuration(qty, rate){

  if (qty !== "" && rate !== "") {
    let durationHrs = parseInt(qty) / parseInt(rate)
    let momentDuration = moment.duration(durationHrs, 'hours')
    let durationText = getDurationText(momentDuration)
    $('input.prod-sche-gt-chart-datalist-input#duration').val(durationText)
  }else {
    $('input.prod-sche-gt-chart-datalist-input#duration').val('')
  }

}

function getDurationText(momentDuration) {
  let month = momentDuration.get('month')
  let days = momentDuration.get('d')
  let hrs = momentDuration.get('h')
  let mins = momentDuration.get('minute')
  let text = 'under 1 minute'

  if (month > 0) {return 'Over a month!'}

  if (days !== 0) { hrs += days * 24 }

  if (hrs !== 0 && mins !== 0) {
    text = hrs + ' hour(s) & ' + mins + ' minute(s)'
  }else if (hrs !== 0 && mins === 0){
    text = hrs + ' hour(s)'
  }else if (hrs === 0 && mins !== 0){
    text = mins + ' minute(s)'
  }
  
  return text
}

/**
 * Get the product list and production line list from postgresql
 * Call the callback fn passed in once it is finished
 * Stop and prompt error when it fails
 * @param {fn} callback 
 */
function getProductsAndEquipment(callback) {
  let productsUrl = utils.postgRestHost + 'products'
  let equipmentsUrl = utils.postgRestHost + 'equipment?production_line=not.is.null'

  utils.get(productsUrl)
    .then(res => {
      _products = res
      utils.get(equipmentsUrl)
        .then(res => {
          _equipment = res
          callback()
        })
        .catch(e => {
          utils.alert('error', 'Error', 'An error occurred while fetching data from the postgresql : ' + e)        
        })
    })
    .catch(e => {
      utils.alert('error', 'Error', 'An error occurred while fetching data from the postgresql : ' + e)    
    })
}