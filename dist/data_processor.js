'use strict';

System.register(['./utils', 'moment', './chart_ctrl'], function (_export, _context) {
  "use strict";

  var utils, moment, chartCtrl, _order_data, _order_dimensions;

  /**
   * Expecting columns names, and rows values
   * Return {col-1 : value-1, col-2 : value-2 .....}
   * @param {*} rowCols 
   * @param {*} rows 
   */
  function restructuredData(rowCols, rows) {
    var data = [];
    var cols = rowCols.reduce(function (arr, c) {
      var col = c.text.toLowerCase();
      arr.push(col);
      return arr;
    }, []);
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var serise = {};
      for (var k = 0; k < cols.length; k++) {
        var col = cols[k];
        serise[col] = row[k];
      }
      data.push(serise);
    }

    if (data.length === 0) {
      return [];
    }

    return tailorData(data, rowCols);
  }

  _export('restructuredData', restructuredData);

  function tailorData(data, rowCols) {

    //url for writing influxdb data
    var influxUrl = utils.influxHost + 'write?db=smart_factory';

    //sort
    if (data.length > 1) {
      data = data.sort(function (a, b) {
        return a.production_line > b.production_line ? -1 : a.production_line < b.production_line ? 1 : 0;
      });
    }

    //make order_data and its dimensions
    var order_data = takeOfKeys(data);

    var order_dimensions = rowCols.reduce(function (arr, col) {
      arr.push(col.text.toLowerCase());
      return arr;
    }, []);

    //find distinct lines
    var lines = data.reduce(function (arr, d) {
      arr.push(d.production_line);
      return arr;
    }, []);
    lines = utils.findDistinct(lines);

    //make line_data to match the dimension, which is expected by the chart option data
    var line_data = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var l = line.split(' | ');
      var item = [l[0] + ' | ' + l[1], l[2], i, line];
      line_data.push(item);
    }

    var line_dimensions = ['SiteArea', 'Line', 'Index', 'ProductionLine'];

    //add elems to the dimension, which are expected by the option
    var positioning_dimensions = ['index', 'startTime', 'endTime'];
    order_dimensions = positioning_dimensions.concat(order_dimensions);

    //add elems to the order_data to match the dimension
    for (var _i = 0; _i < order_data.length; _i++) {
      var d = data[_i];
      var index = matchIndex(d.production_line, line_data);
      data[_i]["index"] = index;
      var positioning_data = [index, 0, 0];
      order_data[_i] = positioning_data.concat(order_data[_i]);
    }

    //categorise the order_data, group by line, and in each lineGroup, group by date
    var categorisedOrders = categoriseByLineAndDate(order_data, 'array', data);

    var promises = [];
    for (var _i2 = 0; _i2 < categorisedOrders.length; _i2++) {
      var lineGroup = categorisedOrders[_i2];

      var _loop = function _loop(c) {
        var dateGroup = lineGroup[c];
        var _startTime = 0;

        //filter out two groups, one is with startTime initalised, one is not.
        var STkey = 'scheduled_start_datetime';
        var dateGroupWithTime = dateGroup.filter(function (order) {
          return order[findIndex(STkey, order_dimensions)] !== null && order[findIndex(STkey, order_dimensions)] !== undefined;
        });
        var dateGroupWithoutTime = dateGroup.filter(function (order) {
          return order[findIndex(STkey, order_dimensions)] === null || order[findIndex(STkey, order_dimensions)] === undefined;
        });

        //loop thro the date group containing orders that are with time
        for (var wt = 0; wt < dateGroupWithTime.length; wt++) {
          var order = dateGroupWithTime[wt];
          var startTime = order[findIndex(STkey, order_dimensions)];
          var endtime = order[findIndex('scheduled_end_datetime', order_dimensions)];

          if (_startTime === 0) {
            _startTime = moment(endtime);
          } else {
            //start time has been initialised, check if the end time is after the initialised start time
            if (_startTime.isBefore(moment(endtime))) {
              //if yes, update the starttime again
              _startTime = moment(endtime);
            }
          }

          //update order's startTime and endTime
          order[1] = startTime;
          order[2] = endtime;

          var changeover_duration = order[findIndex('planned_changeover_time', order_dimensions)];
          if (changeover_duration !== '0:00:00') {
            //if the order has changeover time
            changeover_duration = moment.duration(changeover_duration);
            var changeover_startTime = moment(startTime).subtract(changeover_duration);
            var changeover = utils.copyObject(order);
            changeover[2] = startTime; // changeover's end time = main order's start time
            changeover[1] = changeover_startTime.valueOf(); // changeover's start time = it's end time - it's changeover time
            changeover[8] = 'Changeover'; // set statuts to be changeover
            order_data.push(changeover);
          }
        }

        //loop thro the date group containing orders that are with NO time
        for (var o = 0; o < dateGroupWithoutTime.length; o++) {
          var _order = dateGroupWithoutTime[o];
          var lineDefaultStartTime = utils.getLineStartTime(_order[findIndex('production_line', order_dimensions)]);
          //if there is no startTime, init it with the order_date and lineDefaultStartTime
          if (_startTime === 0) {
            _startTime = _order[findIndex('order_date', order_dimensions)] + ' ' + lineDefaultStartTime;
            _startTime = moment(_startTime, 'YYYY-MM-DD H:mm:ss');
          }

          //get startTime, then calc the order's duration based on qty and rate, then calc the endTime
          var currentStartTime = _startTime.valueOf();
          var duration = _order[findIndex('order_qty', order_dimensions)] / _order[findIndex('planned_rate', order_dimensions)];
          var _endTime = _startTime.add(duration, 'hours');

          //handle changeover
          var _changeover_duration = _order[findIndex('planned_changeover_time', order_dimensions)];
          if (_changeover_duration !== '0:00:00') {

            //if the order has changeover time
            _changeover_duration = moment.duration(_changeover_duration);
            var _changeover = utils.copyObject(_order);
            _changeover[1] = currentStartTime; // changeover's start time = current start time
            _changeover[2] = moment(currentStartTime).add(_changeover_duration).valueOf(); // changeover's end time = main order's start time
            _changeover[8] = 'Changeover'; // set statuts to be changeover

            order_data.push(_changeover);

            //update the order's startTime and endTime
            _order[1] = moment(currentStartTime).add(_changeover_duration).valueOf();
            _order[2] = _endTime.add(_changeover_duration).valueOf();
          } else {
            //update the order's startTime and endTime
            _order[1] = currentStartTime;
            _order[2] = _endTime.valueOf();
          }

          //update each order to the database
          var _line = writeLine(utils.mergeKeyVal(_order, order_dimensions));
          promises.push(utils.post(influxUrl, _line));
        }
      };

      for (var c = 0; c < lineGroup.length; c++) {
        _loop(c);
      }
    }

    if (promises.length > 0) {
      //do nothing if requests are successful, popup the error if failed.
      Promise.all(promises).then(function (res) {
        chartCtrl.refreshDashb();
      }).catch(function (e) {
        utils.alert('error', 'Influxdb Error', 'An error occurred while updating data : ' + e);
      });
    }

    //set order data and its dimension global because it will be required later from other files
    _order_data = order_data;
    _order_dimensions = order_dimensions;

    // Echart automatically convert number String to Int, so need to add some extra non-num String to avoid this
    // Will need to String.replace('###', '') when use it
    order_data.forEach(function (e) {
      var product_id_api = e[findIndex('product_id', order_dimensions)] + '###';
      e.push(product_id_api);
    });
    order_dimensions.push('product_id_api');

    //return the expect option data
    return {
      order: { data: order_data, dimensions: order_dimensions },
      line: { data: line_data, dimensions: line_dimensions }
    };
  }

  function matchIndex(key, lines) {
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (key === line[3]) {
        return line[2];
      }
    }
    return -1;
  }

  function takeOfKeys(data) {
    return data.map(Object.values);
  }

  /**
   * Expecting an array of arrays, categorise the inner arrays by line
   */
  function categoriseByLineAndDate(data, key, obj) {
    var result = [];

    var _loop2 = function _loop2(i) {
      var elem = data[i];
      var objdata = obj[i];

      var dates = obj.filter(function (d) {
        return d.production_line === objdata.production_line;
      }).map(function (d) {
        return d.order_date;
      });
      dates = Array.from(new Set(dates));
      var dateIndex = findIndex(objdata.order_date, dates);

      if (result[objdata.index]) {
        if (result[objdata.index][dateIndex]) {
          result[objdata.index][dateIndex].push(elem);
        } else {
          result[objdata.index].push([]);
          result[objdata.index][dateIndex].push(elem);
        }
      } else {
        result.push([]);
        if (result[objdata.index][dateIndex]) {
          result[objdata.index][dateIndex].push(elem);
        } else {
          result[objdata.index].push([]);
          result[objdata.index][dateIndex].push(elem);
        }
      }
    };

    for (var i = 0; i < data.length; i++) {
      _loop2(i);
    }

    return result;
  }

  function findIndex(key, array) {
    return array.indexOf(key);
  }

  _export('findIndex', findIndex);

  function writeLine(data) {
    //For influxdb tag keys, must add a forward slash \ before each space   
    var product_desc = data.product_desc.split(' ').join('\\ ');

    var line = 'OrderPerformance,order_id=' + data.order_id + ',product_id=' + data.product_id + ',product_desc=' + product_desc + ' ';

    if (data.compl_qty !== null && data.compl_qty !== undefined) {
      line += 'compl_qty=' + data.compl_qty + ',';
    }

    line += 'order_state="' + data.status + '"' + ',';
    line += 'order_date="' + data.order_date + '"' + ',';
    line += 'production_line="' + data.production_line + '"' + ',';
    line += 'planned_changeover_time="' + data.planned_changeover_time + '"' + ',';
    line += 'order_qty=' + data.order_qty + ',';
    line += 'scheduled_end_datetime=' + data.endTime + ',';
    line += 'scheduled_start_datetime=' + data.startTime + ',';
    line += 'setpoint_rate=' + 0 + ',';
    line += 'planned_rate=' + data.planned_rate;

    return line;
  }

  function getColor(status) {
    var color = void 0;
    switch (status) {
      case 'Changeover':
        color = '#c9c52a';
        break;
      case 'Planned':
        color = '#c9c9c9';
        break;
      case 'Ready':
        color = '#CCFFAF';
        break;
      case 'Next':
        color = '#FFFB85';
        break;
      case 'Paused':
        color = '#E8B20C';
        break;
      case 'Complete':
        color = '#70C6FF';
        break;
      case 'Closed':
        color = '#FF7773';
        break;
      case 'Running':
        color = '#91F449';
        break;
      default:
        color = '#fff';
        break;
    }
    return color;
  }

  _export('getColor', getColor);

  function getData() {
    return utils.mergeKeyArrayVal(_order_data, _order_dimensions).filter(function (order) {
      return order.status !== 'Changeover';
    });
  }

  _export('getData', getData);

  return {
    setters: [function (_utils) {
      utils = _utils;
    }, function (_moment) {
      moment = _moment.default;
    }, function (_chart_ctrl) {
      chartCtrl = _chart_ctrl;
    }],
    execute: function () {
      _order_data = void 0;
      _order_dimensions = void 0;
    }
  };
});
//# sourceMappingURL=data_processor.js.map
