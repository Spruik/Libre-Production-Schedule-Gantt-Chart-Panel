'use strict';

System.register(['./utils', './influx_helper', './data_processor', './instant_search_ctrl', 'moment', './chart_option'], function (_export, _context) {
  "use strict";

  var utils, influx, dp, instant_search, moment, chart, _isInsertingBefore, _targetOrder, _products, _tryCatchCounter, closeForm;

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
   * Show insert actions entry point, will be showed when the user clicked 'Insert' in the order actions form
   * Set the target order global --> show insert actions form (allowing user to choose insert left or right) -
   * --> remove/add listeners
   * @param {*} targetOrder 
   */
  function showActions(targetOrder) {
    _isInsertingBefore = false;
    _targetOrder = targetOrder;
    utils.showModal('insert_actions.html', {});

    //set listeners
    removeListeners();
    addListeners();
  }

  _export('showActions', showActions);

  function removeListeners() {
    $(document).off('click', 'input[type="radio"][name="product-schedule-gantt-chart-insertion-actions-radio"]');
  }

  /**
   * Add listener to check user click
   * If click left (before), set insertion status (_isInsertingBefore) to TRUE and then show order form
   * If click right (after), set insertion status (_isInsertingBefore) to FALSE and then show order form
   */
  function addListeners() {
    $(document).on('click', 'input[type="radio"][name="product-schedule-gantt-chart-insertion-actions-radio"]', function (e) {
      if (e.target.id === 'before') {
        _isInsertingBefore = true;
        showOrderForm();
      } else if (e.target.id === 'after') {
        _isInsertingBefore = false;
        showOrderForm();
      }
    });
  }

  /**
   * Show form entry point, will be showed when the user clicked insert left or right
   * Get data --> Show Form --> Initialse special functions --> remove/add listeners
   */
  function showOrderForm() {
    //get products data from postgres database
    getProducts(callback);

    //getting data successful
    function callback() {
      //show the modal form
      utils.showModal('order_form.html', {});

      //try initialize the form
      _tryCatchCounter = 1;
      tryInitialisingForm();

      //set listeners
      removeListenersForOrderForm();
      addListenersForOrderForm();
    }
  }

  /**
   * Try initialise the form, if failed, wait for 200 milsec and then re-init the form again
   * If failed over 15 times, stop initialising and show error to the user
   */
  function tryInitialisingForm() {
    setTimeout(function () {
      try {
        initialiseForm();
      } catch (e) {
        if (_tryCatchCounter < 15) {
          //maximunm re-init the form over 15 times
          tryInitialisingForm();
          _tryCatchCounter++;
        } else {
          closeForm();
          utils.alert('error', 'Error', 'Form initialisation failed, please try agian : ' + e);
        }
      }
    }, 200);
  }

  /**
   * Initialise the instant search function for product field and equipment field
   * Initialise the timepicker for the changeover field
   */
  function initialiseForm() {
    //init the instant search function
    instant_search.enableInstantSearch(_products);

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

  /**
   * Prefill the datepicker because it is inserting, the date is based on the target order's startime or endtime
   * Prefill the Production Line field where it equals to the targeted order's line
   * Current order's date = target order's start time if it is inserting before
   * Current order's date = target order's end time if it is inserting after
   */
  function prefill() {
    var time = moment(_isInsertingBefore ? _targetOrder.startTime : _targetOrder.endTime).format('YYYY-MM-DD');
    $('input.prod-sche-gt-chart-datalist-input#datepicker').val(time);
    $('input.prod-sche-gt-chart-datalist-input#datalist-input-production-line').val(_targetOrder.production_line);
  }

  function removeListenersForOrderForm() {
    $(document).off('click', 'button#product-schedule-gantt-chart-order-form-submitBtn');
    $(document).off('input', 'input#planned-rate, input#order-qty');
  }

  function addListenersForOrderForm() {
    $(document).on('click', 'button#product-schedule-gantt-chart-order-form-submitBtn', function (e) {
      var data = $('form#product-schedule-gantt-chart-order-form').serializeArray();
      submitOrder(data);
    });

    $(document).on('input', 'input#planned-rate, input#order-qty', function (e) {
      var data = $('form#product-schedule-gantt-chart-order-form').serializeArray();
      updateDuration(data[1].value, data[5].value);
    });
  }

  function submitOrder(data) {
    //locate the line where the user is trying to insert the new order, which is for further filtering uses
    var allData = dp.getData();

    var changeover = data[7].value;
    var qty = data[1].value;
    var rate = data[5].value;
    var order_duration = parseInt(qty, 10) / parseInt(rate, 10);
    var startTime = moment(_isInsertingBefore ? calcStartTime(_targetOrder) : _targetOrder.endTime).add(moment.duration(changeover)).valueOf();
    var endTime = moment(_isInsertingBefore ? calcStartTime(_targetOrder) : _targetOrder.endTime).add(moment.duration(changeover)).add(order_duration, 'hours').valueOf();

    var inputValues = {
      orderId: data[0].value,
      orderQty: qty,
      productionLine: data[2].value,
      product: data[3].value,
      date: _targetOrder.order_date,
      plannedRate: rate,
      duration: data[6].value,
      changeover: changeover,
      startTime: startTime,
      endTime: endTime
    };

    if (isValueValid(inputValues)) {
      insertOrder(inputValues, allData);
    }
  }

  function insertOrder(inputValues, allData) {
    //Firstly, find all data to look for orders in the same line to see if there is other order affected by this insertion
    var ordersWithSameLine = allData.filter(function (order) {
      return order.production_line === _targetOrder.production_line;
    });

    var ordersBeingAffected = ordersWithSameLine.filter(function (order) {
      var startTime = moment(inputValues.startTime);
      var changeover_dur = moment.duration(inputValues.changeover);
      return order.startTime >= startTime.subtract(changeover_dur).valueOf() && order.order_date === inputValues.date;
    });

    //calculate the total duration that the inserting order is taking, and then each affected order will be adding up with this total duarion later
    var insertOrderChangeover = moment.duration(inputValues.changeover);
    var totalDuration = moment.duration(moment(inputValues.endTime).diff(moment(inputValues.startTime)));
    totalDuration.add(insertOrderChangeover);

    if (!isLineHavingSpareTimeForTheDay(ordersBeingAffected, totalDuration, _targetOrder.endTime)) {
      utils.alert('warning', 'Warning', "There is no spare space for this order to fit in this date's schedule");
      return;
    }

    //promises for later requests
    var promises = [];

    //update the inserting order first
    var line = influx.writeLineForCreate(inputValues);
    promises.push(utils.post(influx.writeUrl, line));

    //loop thro the ordersBeingAffected to update all orders being affected
    for (var i = 0; i < ordersBeingAffected.length; i++) {
      var order = ordersBeingAffected[i];
      var _line = influx.writeLineForTimeUpdate(order, totalDuration, 'add');
      promises.push(utils.post(influx.writeUrl, _line));
    }

    //handle requests
    Promise.all(promises).then(function (res) {
      //successful
      closeForm();
      utils.alert('success', 'Successful', 'Order has been successfully inserted');
      chart.refreshDashboard();
    }).catch(function (e) {
      //error
      utils.alert('error', 'Error', 'An error occurred when inserting the order : ' + e);
    });
  }

  /**
   * Add up order's start time and its changeover time to see it's real start time
   * @param {*} order 
   */
  function calcStartTime(order) {
    return moment(order.startTime).subtract(moment.duration(order.planned_changeover_time)).valueOf();
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
      var str = p.id + ' | ' + p.product_desc;
      arr.push(str);
      return arr;
    }, []);

    if (data.orderId === '') {
      utils.alert('warning', 'Warning', 'Order Number Empty, please enter the Order Number');
      return false;
    }

    if (data.orderQty === '') {
      utils.alert('warning', 'Warning', 'Order Quantity Empty, please enter the Order Quantity');
      return false;
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

  /**
   * Expecting the array of all orders that are affected @param {*} ordersAffected , 
   * and the moment object of the totoal duration
   * @param {*} insertingOrderDuration  (including order duration time and changeover duration time)
   * 
   * Return a boolean to tell if an order can be made.
   * 
   * If, after adding up with the inserting order's duration, the last affected order's end time exceeds the next day's start time, return false
   */
  function isLineHavingSpareTimeForTheDay(ordersAffected, insertingOrderDuration, targetOrderEndTime) {
    //find the max value of affected orders' end time
    var maxEndTime = void 0;
    if (ordersAffected.length !== 0) {
      var all_end_times = ordersAffected.map(function (order) {
        return order.endTime;
      });
      maxEndTime = moment(Math.max.apply(Math, _toConsumableArray(all_end_times)));
    } else {
      //if there is no affected orders, the target order's endtime is the maxtime
      maxEndTime = moment(targetOrderEndTime);
    }
    //get the target day's order date in order to calculate the next day
    var targetDay = moment(_targetOrder.order_date, 'YYYY-MM-DD');
    var nextDay = targetDay.add(1, 'days').format('YYYY-MM-DD');

    //max time add inserting order's total duration
    maxEndTime.add(insertingOrderDuration);

    //use next day to make up next day's start time
    var nextDayStartTime = moment(nextDay + ' ' + utils.getLineStartTime(_targetOrder.production_line), 'YYYY-MM-DD H:mm:ss');

    //if after adding the max time with the inserting order's total duration, max time is greater than next day's start time, return false
    return maxEndTime.isSameOrBefore(nextDayStartTime);
  }

  /**
   * Use the qty and rate that are passed in to dynamically update the duration field
   * @param {*} qty 
   * @param {*} rate 
   */
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
   * Retrieve product data and equipment data from Postgres
   * Set the retrieved data global
   * Call the callback function passed in when all is successful
   * Alert error when anyone of them has failed
   * @param {*} callback 
   */
  function getProducts(callback) {
    var productsUrl = utils.postgRestHost + 'product';
    utils.get(productsUrl).then(function (res) {
      _products = res;
      callback();
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
      _isInsertingBefore = void 0;
      _targetOrder = void 0;
      _products = void 0;
      _tryCatchCounter = 1;

      closeForm = function closeForm() {
        return $('a#product-schedule-gantt-chart-order-form-close-btn').trigger('click');
      };
    }
  };
});
//# sourceMappingURL=insertion_actions_ctrl.js.map
