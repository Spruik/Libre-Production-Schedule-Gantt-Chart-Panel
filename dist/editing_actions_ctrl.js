'use strict';

System.register(['./utils', './influx_helper', './data_processor', './instant_search_ctrl', 'moment', './chart_option'], function (_export, _context) {
  "use strict";

  var utils, influx, dp, instant_search, moment, chart, _targetOrder, _ordersBeingAffected, _tryCatchCounter, _products, _equipment, closeForm;

  function _toConsumableArray(arr) {
    if (Array.isArray(arr)) {
      for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) {
        arr2[i] = arr[i];
      }

      return arr2;
    } else {
      return Array.from(arr);
    }
  }

  /**
   * Show edition order form
   * @param {*} targetOrder The order that the user want to make edition on
   */
  function showActions(targetOrder) {

    _targetOrder = targetOrder;

    //get products data and equipment from postgres database
    getProductsAndEquipment(callback);

    function callback() {

      utils.showModal('order_form.html', {});

      //try initialize the form
      _tryCatchCounter = 1;
      tryInitialisingForm();

      //set listeners
      removeListeners();
      addListeners();
    }
  }

  _export('showActions', showActions);

  function tryInitialisingForm() {
    setTimeout(function () {
      try {
        initialiseForm();
      } catch (e) {
        if (_tryCatchCounter < 15) {
          //maximunm re-init the form over 15 times
          initialiseForm();
          _tryCatchCounter++;
        } else {
          closeForm();
          utils.alert('error', 'Error', 'Form initialisation failed, please try agian : ' + e);
        }
      }
    }, 200);
  }

  function initialiseForm() {
    //init the instant search function
    instant_search.enableInstantSearch(_products, _equipment);

    //init datepicker
    $('#datepicker').datepicker({
      orientation: 'top',
      todayBtn: 'linked',
      format: 'yyyy-mm-dd',
      autoclose: true
    });

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
    });

    //prefill date field and production line
    prefill();
  }

  function prefill() {
    $('input.prod-sche-gt-chart-datalist-input#order-id').val(_targetOrder.order_id);
    $('input.prod-sche-gt-chart-datalist-input#order-qty').val(_targetOrder.order_qty);
    $('input.prod-sche-gt-chart-datalist-input#datalist-input-production-line').val(_targetOrder.production_line);
    $('input.prod-sche-gt-chart-datalist-input#datalist-input-production-line').attr('readonly', false);
    $('i.prod-sche-gt-chart-dl-i#datalist-icon').show();
    $('input.prod-sche-gt-chart-datalist-input#datalist-input-products').val(_targetOrder.product_id + ' | ' + _targetOrder.product_desc);
    $('input.prod-sche-gt-chart-datalist-input#datepicker').val(_targetOrder.order_date);
    $('input.prod-sche-gt-chart-datalist-input#datepicker').attr('readonly', false);
    $('input.prod-sche-gt-chart-datalist-input#planned-rate').val(_targetOrder.planned_rate);
    $('input.prod-sche-gt-chart-datalist-input#changeover-minutes-picker').val(_targetOrder.planned_changeover_time);
    updateDuration(_targetOrder.order_qty, _targetOrder.planned_rate);
  }

  function removeListeners() {
    $(document).off('input', 'input#planned-rate, input#order-qty');
    $(document).off('click', 'button#product-schedule-gantt-chart-order-form-submitBtn');
  }

  function addListeners() {
    $(document).on('input', 'input#planned-rate, input#order-qty', function () {
      var data = $('form#product-schedule-gantt-chart-order-form').serializeArray();
      updateDuration(data[1].value, data[5].value);
    });

    $(document).on('click', 'button#product-schedule-gantt-chart-order-form-submitBtn', function (e) {
      var data = $('form#product-schedule-gantt-chart-order-form').serializeArray();
      submitOrder(data);
    });
  }

  function submitOrder(data) {

    var inputValues = {
      orderId: data[0].value,
      orderQty: data[1].value,
      productionLine: data[2].value,
      product: data[3].value,
      date: data[4].value,
      plannedRate: data[5].value,
      duration: data[6].value,
      changeover: data[7].value,
      startTime: _targetOrder.startTime,
      endTime: _targetOrder.endTime
    };

    if (isValueValid(inputValues)) {
      updateOrder(inputValues);
    }
  }

  function updateOrder(inputValues) {

    var allData = dp.getData();

    //the orders that are in the original line that this order was in and that are being affected because this order changes line
    var ordersBeingAffected = getOrdersBeingAffect(allData, inputValues);
    _ordersBeingAffected = ordersBeingAffected;

    if (!isLineHavingSpareTimeForTheDay(allData, inputValues, _targetOrder)) {
      utils.alert('warning', 'Warning', "There is no spare space for this order to fit in this date's schedule");
      return;
    }

    if (isTagsChanged(inputValues)) {

      updateOldAndNewOrders(inputValues);
    } else {
      //in here, check if the line has changed, if yes, meaning that the order is going to another line
      //so also update all affectingOrders(orders that are in the original line and that are after this order)
      if (isLineChanged(inputValues)) {
        //save the order directly with removing its starttime and endtime to let the initialiser to init it again
        //coz it is changing line, so just simply remove the start time and end time
        updateWithRemoving(inputValues);
      } else {
        if (isDateChanged(inputValues)) {
          updateWithRemoving(inputValues);
        } else {
          //save the order directly with changing its starttime and endtime
          updateWithChanging(inputValues);
        }
      }
    }
  }

  /**
   * get alldata and the user input to filter all affected orders.
   * These orders will be the ones that are in the original line with the same date.
   * @param {*} allData All the orders that is being passed in and displayed in this panel
   * @param {*} inputValues Inputs that the user entered in this order edition form
   */
  function getOrdersBeingAffect(allData, inputValues) {
    var ordersInOriginalLineAndDate = allData.filter(function (order) {
      return order.production_line === _targetOrder.production_line && order.order_date === _targetOrder.order_date;
    });
    return ordersInOriginalLineAndDate.filter(function (order) {
      var endTime = moment(inputValues.endTime);
      return order.startTime >= endTime.valueOf() && order.order_date === _targetOrder.order_date;
    });
  }

  /**
   * Compares the user input and the original order to see if the line has been changed.
   * return true if it is.
   * @param {*} inputValues The user input
   */
  function isLineChanged(inputValues) {
    return inputValues.productionLine !== _targetOrder.production_line;
  }

  function isLineHavingSpareTimeForTheDay(allData, inputValues, targetOrder) {

    //all orders in the targeting line (except the editing order itself (if line not changed))
    var affectedOrders = allData.filter(function (order) {
      return order.production_line === inputValues.productionLine && order.order_date === inputValues.date;
    });
    affectedOrders = affectedOrders.filter(function (order) {
      return order.order_id !== targetOrder.order_id;
    });

    //find the line's default start time and then plus next day
    var targetDayStartTime = moment(moment(inputValues.date, 'YYYY-MM-DD').format('YYYY-MM-DD') + ' ' + utils.getLineStartTime(targetOrder.production_line), 'YYYY-MM-DD H:mm:ss');
    var targetDayStartTimeText = targetDayStartTime.format('YYYY-MM-DD H:mm:ss');
    var nextDayStartTime = moment(targetDayStartTimeText, 'YYYY-MM-DD H:mm:ss').add(1, 'days');

    //calc edited order's duration
    var duration = moment.duration(inputValues.orderQty / inputValues.plannedRate, 'hours');
    var changeover = moment.duration(inputValues.changeover, 'H:mm:ss');
    var totalDur = duration.add(changeover);

    //if no affected orders, see if target dat start time + totaldur <= nextdatstarttime
    if (affectedOrders.length === 0) {
      return targetDayStartTime.add(totalDur).isSameOrBefore(nextDayStartTime);
    }

    //get the max end time
    var all_end_times = affectedOrders.map(function (order) {
      return order.endTime;
    });
    var maxEndTime = moment(Math.max.apply(Math, _toConsumableArray(all_end_times)));
    maxEndTime.add(totalDur);

    return maxEndTime.isSameOrBefore(nextDayStartTime);
  }

  /**
   * Take the user input, send request to change the current order to be what the user has entered in the edition form
   * It will remove the order's start time and end time because it is changing line so that no order will be affected in the changing line
   * and so that the start time and end time can be removed, and then let the initialiser to init the time again.
   * @param {*} inputValues The user input
   */
  function updateWithRemoving(inputValues) {
    var line = influx.writeLineForUpdateWithRemovingTime(inputValues, _targetOrder.status);
    utils.post(influx.writeUrl, line).then(function (res) {
      if (_ordersBeingAffected.length > 0) {
        var difference = getDiff(inputValues);
        updateAffectedOrders(inputValues, difference);
      } else {
        closeForm();
        utils.alert('success', 'Successful', 'Order has been successfully updated');
        chart.refreshDashboard();
      }
    }).catch(function (e) {
      closeForm();
      utils.alert('error', 'Error', 'An error occurred when updated the order : ' + e);
    });
  }

  /**
   * Take the user input, send request to change the current order to be what the user has entered in the edition form
   * It normally changes the current order's starttime and endtime because the order is being changed
   * @param {*} inputValues User input
   */
  function updateWithChanging(inputValues) {
    var originalStartTime = _targetOrder.startTime;
    //The difference between the original changeover and the edited changeover
    var changeoverDiff = moment.duration(inputValues.changeover).subtract(moment.duration(_targetOrder.planned_changeover_time));
    var startTime = moment(originalStartTime).add(changeoverDiff);
    var duration = moment.duration(inputValues.orderQty / inputValues.plannedRate, 'hours');
    var endTime = moment(originalStartTime).add(changeoverDiff).add(duration);

    //calc the difference between the edited order's total duration and the original order's total duration
    //so that all the affected orders know how many to add/subtract
    var oldTotal = moment.duration(_targetOrder.order_qty / _targetOrder.planned_rate, 'hours').add(moment.duration(_targetOrder.planned_changeover_time));
    var newTotal = duration.add(moment.duration(inputValues.changeover));
    var difference = oldTotal.subtract(newTotal);

    var line = influx.writeLineForUpdateWithChangingTime(inputValues, _targetOrder.status, startTime.valueOf(), endTime.valueOf());
    utils.post(influx.writeUrl, line).then(function (res) {
      updateAffectedOrders(inputValues, difference);
    }).catch(function (e) {
      closeForm();
      utils.alert('error', 'Error', 'An error occurred when updated the order : ' + e);
    });
  }

  /**
   * Take the time difference, send request to add/subtract the time diff for all the affected orders due to -
   * the edited order being changed or removed from the current line and date
   * @param {*} inputValues The user input
   * @param {*} difference The time difference that all affected orders will need to add/subtract
   */
  function updateAffectedOrders(inputValues, difference) {
    var promises = [];

    _ordersBeingAffected.forEach(function (order) {
      var line = influx.writeLineForTimeUpdate(order, difference, 'subtract');
      var prom = utils.post(influx.writeUrl, line);
      promises.push(prom);
    });
    Promise.all(promises).then(function (res) {
      closeForm();
      utils.alert('success', 'Successful', 'Order has been successfully updated');
      chart.refreshDashboard();
    }).catch(function (e) {
      closeForm();
      utils.alert('error', 'Error', 'An error occurred when updated the order : ' + e);
    });
  }

  /**
   * Take inputValues and find the qty and rate to calc the duration
   * then return duration + changeover duration
   * @param {*} inputValues User input for the form
   */
  function getDiff(inputValues) {
    var diff = void 0;
    var duration = moment.duration(inputValues.orderQty / inputValues.plannedRate, 'hours');
    var changeover = moment.duration(inputValues.changeover, 'H:mm:ss');
    diff = duration.add(changeover);
    return diff;
  }

  function updateOldAndNewOrders(inputValues) {
    var line = influx.writeLineForUpdate('Replaced', _targetOrder);
    utils.post(influx.writeUrl, line).then(function (res) {
      //save the new order directly with removing its starttime and endtime to let the initialiser to init it again
      //becuase this is the first
      if (isLineChanged(inputValues)) {
        updateWithRemoving(inputValues);
      } else {
        if (isDateChanged(inputValues)) {
          updateWithRemoving(inputValues);
        } else {
          updateWithChanging(inputValues);
        }
      }
    }).catch(function (e) {
      closeForm();
      utils.alert('error', 'Error', 'An error occurred when updated the order : ' + e);
    });
  }

  /**
   * Return treu if the user has changed the order date
   * @param {*} inputValues The users input for this form editing
   */
  function isDateChanged(inputValues) {
    return inputValues.date !== _targetOrder.order_date;
  }

  /**
   * Return true if the user has changed tag values (order_id, product_id, product_desc)
   * @param {*} inputValues The users input for this form editing
   */
  function isTagsChanged(inputValues) {
    var product_id = inputValues.product.split(' | ')[0];
    var product_desc = inputValues.product.split(' | ')[1];

    return _targetOrder.order_id !== inputValues.orderId || _targetOrder.product_id !== product_id || _targetOrder.product_desc !== product_desc;
  }

  /**
   * Expect the user inputs
   * Check if the user inputs are valid
   * Stop and prompt error if the inputs are not valid
   * @param {*} data 
   */
  function isValueValid(data) {

    var dateRegExp = new RegExp('^[0-9]{4}-(((0[13578]|(10|12))-(0[1-9]|[1-2][0-9]|3[0-1]))|(02-(0[1-9]|[1-2][0-9]))|((0[469]|11)-(0[1-9]|[1-2][0-9]|30)))$');
    var prodList = _products.reduce(function (arr, p) {
      var str = p.product_id + ' | ' + p.product_desc;
      arr.push(str);
      return arr;
    }, []);

    var productionLineList = _equipment.reduce(function (arr, equ) {
      arr.push(equ.site + ' | ' + equ.area + ' | ' + equ.production_line);
      return arr;
    }, []);
    productionLineList = utils.findDistinct(productionLineList);

    if (data.orderId === '') {
      utils.alert('warning', 'Warning', 'Order Number Empty, please enter the Order Number');
      return false;
    }

    if (data.orderQty === '') {
      utils.alert('warning', 'Warning', 'Order Quantity Empty, please enter the Order Quantity');
      return false;
    }

    if (data.productionLine === '') {
      utils.alert('warning', 'Warning', 'Production Line Empty, please enter the Production Line');
      return false;
    } else {
      if (productionLineList.indexOf(data.productionLine) === -1) {
        utils.alert('warning', 'Warning', 'Production Line Not Exist, please select a Production Line from the Production Line List');
        return false;
      }
    }

    if (data.product === '') {
      utils.alert('warning', 'Warning', 'Product Empty, please enter the Product');
      return false;
    } else {
      if (prodList.indexOf(data.product) === -1) {
        utils.alert('warning', 'Warning', 'Product Not Exist, please select a Product from the Product List');
        return false;
      }
    }

    if (!dateRegExp.test(data.date)) {
      utils.alert('warning', 'Warning', 'Scheduled Start Date Empty or Invalid Date Format, please choose a date from the date picker');
      return false;
    }

    if (data.plannedRate === '') {
      utils.alert('warning', 'Warning', 'Planned Rate Empty, please enter the Planned Rate');
      return false;
    }

    return true;
  }

  function updateDuration(qty, rate) {

    if (qty !== "" && rate !== "") {
      var durationHrs = parseInt(qty) / parseInt(rate);
      var momentDuration = moment.duration(durationHrs, 'hours');
      var durationText = getDurationText(momentDuration);
      $('input.prod-sche-gt-chart-datalist-input#duration').val(durationText);
    } else {
      $('input.prod-sche-gt-chart-datalist-input#duration').val('');
    }
  }

  function getDurationText(momentDuration) {
    var month = momentDuration.get('month');
    var days = momentDuration.get('d');
    var hrs = momentDuration.get('h');
    var mins = momentDuration.get('minute');
    var text = 'under 1 minute';

    if (month > 0) {
      return 'Over a month!';
    }

    if (days !== 0) {
      hrs += days * 24;
    }

    if (hrs !== 0 && mins !== 0) {
      text = hrs + ' hour(s) & ' + mins + ' minute(s)';
    } else if (hrs !== 0 && mins === 0) {
      text = hrs + ' hour(s)';
    } else if (hrs === 0 && mins !== 0) {
      text = mins + ' minute(s)';
    }

    return text;
  }

  /**
   * Get the product list and production line list from postgresql
   * Call the callback fn passed in once it is finished
   * Stop and prompt error when it fails
   * @param {fn} callback 
   */
  function getProductsAndEquipment(callback) {
    var productsUrl = utils.postgRestHost + 'products';
    var equipmentsUrl = utils.postgRestHost + 'equipment?production_line=not.is.null';

    utils.get(productsUrl).then(function (res) {
      _products = res;
      utils.get(equipmentsUrl).then(function (res) {
        _equipment = res;
        callback();
      }).catch(function (e) {
        utils.alert('error', 'Error', 'An error occurred while fetching data from the postgresql : ' + e);
      });
    }).catch(function (e) {
      utils.alert('error', 'Error', 'An error occurred while fetching data from the postgresql : ' + e);
    });
  }
  return {
    setters: [function (_utils) {
      utils = _utils;
    }, function (_influx_helper) {
      influx = _influx_helper;
    }, function (_data_processor) {
      dp = _data_processor;
    }, function (_instant_search_ctrl) {
      instant_search = _instant_search_ctrl;
    }, function (_moment) {
      moment = _moment.default;
    }, function (_chart_option) {
      chart = _chart_option;
    }],
    execute: function () {
      _targetOrder = void 0;
      _ordersBeingAffected = void 0;
      _tryCatchCounter = 1;
      _products = void 0;
      _equipment = void 0;

      closeForm = function closeForm() {
        return $('a#product-schedule-gantt-chart-order-form-close-btn').trigger('click');
      };
    }
  };
});
//# sourceMappingURL=editing_actions_ctrl.js.map
