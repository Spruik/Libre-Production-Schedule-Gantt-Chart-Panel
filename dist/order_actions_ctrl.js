'use strict';

System.register(['./utils', './influx_helper', './insertion_actions_ctrl', './editing_actions_ctrl', './data_processor', 'moment', './chart_option'], function (_export, _context) {
  "use strict";

  var utils, influx, insert_actions, edit_actions, dp, moment, chart, _order, closeForm;

  function showOrderActions(order) {
    //set the order passed in global
    _order = order;

    //check if the order is available for editing, only 'planned' and 'ready' can be edited by scheduler
    if (order.status !== 'Planned' && order.status !== 'Ready') {
      utils.alert('warning', 'Warning', 'This order is ' + rowData.order_state + ' and is no longer available for editing');
      return;
    }

    //pop up the actions form
    utils.showModal('order_actions.html', {});

    //set listeners
    removeListeners();
    addListeners();
  }

  _export('showOrderActions', showOrderActions);

  function removeListeners() {
    $(document).off('click', 'input[type="radio"][name="product-schedule-gantt-chart-order-actions-radio"]');
  }

  function addListeners() {
    $(document).on('click', 'input[type="radio"][name="product-schedule-gantt-chart-order-actions-radio"]', function (e) {
      if (e.target.id === 'insert') {
        insertOrder();
      } else if (e.target.id === 'edit') {
        editOrder();
      } else if (e.target.id === 'release') {
        if (_order.status === 'Ready') {
          utils.alert('warning', 'Warning', 'Order has already been released');
          closeForm();
        } else {
          updateOrderStatus('Ready');
        }
      } else if (e.target.id === 'delete') {
        updateOrderStatus('Deleted');
      }
    });
  }

  function insertOrder() {
    insert_actions.showActions(_order);
  }

  function editOrder() {
    edit_actions.showActions(_order);
  }

  function updateOrderStatus(status) {
    var line = influx.writeLineForUpdate(status, _order);
    if (status === 'Deleted') {
      deleteCurrentAndUpdateAffectOrders(line);
    } else {
      utils.post(influx.writeUrl, line).then(function (res) {
        utils.alert('success', 'Success', 'Order has been marked as ' + status);
        closeForm();
        chart.refreshDashboard();
      }).catch(function (e) {
        utils.alert('error', 'Database Error', 'An error occurred while updating the order : ' + e);
        closeForm();
      });
    }
  }

  function deleteCurrentAndUpdateAffectOrders(line) {
    //create promises array and put the 'delete current order request' into it first
    var promises = [utils.post(influx.writeUrl, line)];

    //get all orders data for further filtering
    var allData = dp.getData();

    //filter affected orders using all orders data
    //affected orders = order.startTime >= thisOrder.endtime && in the same line && with the same date.
    var affectedOrders = allData.filter(function (order) {
      return order.startTime >= _order.endTime && order.production_line === _order.production_line && order.order_date === _order.order_date;
    });

    //work out thisOrder's total duration, which = its duration + its changeover duration
    var deletingOrderDurationHour = moment.duration(_order.order_qty / _order.planned_rate, 'hours');
    var deletingOrderChangeover = moment.duration(_order.planned_changeover_time, 'H:mm:ss');
    var deletingOrderTotalDur = deletingOrderDurationHour.add(deletingOrderChangeover);

    //loop affected orders, order's starttime and endtime should both subtract the total duration worked out
    affectedOrders.forEach(function (order) {
      var line = influx.writeLineForTimeUpdate(order, deletingOrderTotalDur, 'subtract');
      promises.push(utils.post(influx.writeUrl, line));
    });

    Promise.all(promises).then(function () {
      utils.alert('success', 'Success', 'Order has been marked as Deleted');
      closeForm();
      chart.refreshDashboard();
    }).catch(function (e) {
      utils.alert('error', 'Database Error', 'An error occurred while deleting the order : ' + e);
      closeForm();
    });
  }
  return {
    setters: [function (_utils) {
      utils = _utils;
    }, function (_influx_helper) {
      influx = _influx_helper;
    }, function (_insertion_actions_ctrl) {
      insert_actions = _insertion_actions_ctrl;
    }, function (_editing_actions_ctrl) {
      edit_actions = _editing_actions_ctrl;
    }, function (_data_processor) {
      dp = _data_processor;
    }, function (_moment) {
      moment = _moment.default;
    }, function (_chart_option) {
      chart = _chart_option;
    }],
    execute: function () {
      _order = void 0;

      closeForm = function closeForm() {
        return $('a#product-schedule-gantt-chart-order-actions-close-btn').trigger('click');
      };
    }
  };
});
//# sourceMappingURL=order_actions_ctrl.js.map
