'use strict';

System.register(['angular', 'lodash', 'jquery', './data_processor', './chart_option', './utils', './libs/echarts.min', 'app/plugins/sdk', './css/style.css!', './css/bootstrap-slider.css!', './css/instant-search.css!'], function (_export, _context) {
  "use strict";

  var angular, _, $, dp, chart, utils, echarts, MetricsPanelCtrl, _createClass, _get, panelDefaults, ChartCtrl;

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  function _possibleConstructorReturn(self, call) {
    if (!self) {
      throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
    }

    return call && (typeof call === "object" || typeof call === "function") ? call : self;
  }

  function _inherits(subClass, superClass) {
    if (typeof superClass !== "function" && superClass !== null) {
      throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
    }

    subClass.prototype = Object.create(superClass && superClass.prototype, {
      constructor: {
        value: subClass,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
    if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass;
  }

  return {
    setters: [function (_angular) {
      angular = _angular.default;
    }, function (_lodash) {
      _ = _lodash.default;
    }, function (_jquery) {
      $ = _jquery.default;
    }, function (_data_processor) {
      dp = _data_processor;
    }, function (_chart_option) {
      chart = _chart_option;
    }, function (_utils) {
      utils = _utils;
    }, function (_libsEchartsMin) {
      echarts = _libsEchartsMin.default;
    }, function (_appPluginsSdk) {
      MetricsPanelCtrl = _appPluginsSdk.MetricsPanelCtrl;
    }, function (_cssStyleCss) {}, function (_cssBootstrapSliderCss) {}, function (_cssInstantSearchCss) {}],
    execute: function () {
      _createClass = function () {
        function defineProperties(target, props) {
          for (var i = 0; i < props.length; i++) {
            var descriptor = props[i];
            descriptor.enumerable = descriptor.enumerable || false;
            descriptor.configurable = true;
            if ("value" in descriptor) descriptor.writable = true;
            Object.defineProperty(target, descriptor.key, descriptor);
          }
        }

        return function (Constructor, protoProps, staticProps) {
          if (protoProps) defineProperties(Constructor.prototype, protoProps);
          if (staticProps) defineProperties(Constructor, staticProps);
          return Constructor;
        };
      }();

      _get = function get(object, property, receiver) {
        if (object === null) object = Function.prototype;
        var desc = Object.getOwnPropertyDescriptor(object, property);

        if (desc === undefined) {
          var parent = Object.getPrototypeOf(object);

          if (parent === null) {
            return undefined;
          } else {
            return get(parent, property, receiver);
          }
        } else if ("value" in desc) {
          return desc.value;
        } else {
          var getter = desc.get;

          if (getter === undefined) {
            return undefined;
          }

          return getter.call(receiver);
        }
      };

      panelDefaults = {
        targets: [{}],
        pageSize: null,
        showHeader: true,
        styles: [],
        columns: [],
        fontSize: '100%'
      };

      _export('ChartCtrl', ChartCtrl = function (_MetricsPanelCtrl) {
        _inherits(ChartCtrl, _MetricsPanelCtrl);

        function ChartCtrl($scope, $injector, templateSrv, annotationsSrv, $sanitize, variableSrv) {
          _classCallCheck(this, ChartCtrl);

          var _this = _possibleConstructorReturn(this, (ChartCtrl.__proto__ || Object.getPrototypeOf(ChartCtrl)).call(this, $scope, $injector));

          _this.pageIndex = 0;

          if (_this.panel.styles === void 0) {
            _this.panel.styles = _this.panel.columns;
            _this.panel.columns = _this.panel.fields;
            delete _this.panel.columns;
            delete _this.panel.fields;
          }

          _.defaults(_this.panel, panelDefaults);

          _this.events.on('data-received', _this.onDataReceived.bind(_this));
          _this.events.on('data-error', _this.onDataError.bind(_this));
          _this.events.on('data-snapshot-load', _this.onDataReceived.bind(_this));

          _this.hasData = false;
          return _this;
        }

        _createClass(ChartCtrl, [{
          key: 'issueQueries',
          value: function issueQueries(datasource) {
            this.pageIndex = 0;

            if (this.panel.transform === 'annotations') {
              this.setTimeQueryStart();
              return this.annotationsSrv.getAnnotations({
                dashboard: this.dashboard,
                panel: this.panel,
                range: this.range
              }).then(function (annotations) {
                return { data: annotations };
              });
            }

            return _get(ChartCtrl.prototype.__proto__ || Object.getPrototypeOf(ChartCtrl.prototype), 'issueQueries', this).call(this, datasource);
          }
        }, {
          key: 'onDataError',
          value: function onDataError(err) {
            this.dataRaw = [];
            this.render();
          }
        }, {
          key: 'onDataReceived',
          value: function onDataReceived(dataList) {

            if (dataList.length === 0 || dataList === null || dataList === undefined) {
              // console.log('No data reveived')
              this.hasData = false;
              return;
            } else {
              this.hasData = true;
            }

            if (dataList[0].type !== 'table') {
              console.log('To show the pie chart, please format data as a TABLE in the Metrics Setting');
              return;
            }

            //dataList data is messy and with lots of unwanted data, so we need to filter out data that we want -
            var data = dp.restructuredData(dataList[0].columns, dataList[0].rows);
            if (data.length === 0) {
              this.hasData = false;
              return;
            }

            this.render(data);
          }
        }, {
          key: 'rendering',
          value: function rendering() {
            this.render(this.globe_data);
          }
        }, {
          key: 'link',
          value: function link(scope, elem, attrs, ctrl) {
            var $panelContainer = elem.find('#production-schedule-gantt-chart')[0];
            var myChart = echarts.init($panelContainer);

            function renderPanel(data) {
              if (!myChart || !data) {
                return;
              }

              var option = chart.getOption(data);

              myChart.setOption(option);
              setTimeout(function () {
                $('#production-schedule-gantt-chart').height(ctrl.height - 51);
                myChart.resize();
                window.onresize = function () {
                  myChart.resize();
                };
              }, 500);

              chart.interationSetup(myChart, ctrl);
            }

            ctrl.events.on('panel-size-changed', function () {
              if (myChart) {
                var height = ctrl.height - 51;
                if (height >= 280) {
                  $('#production-schedule-gantt-chart').height(height);
                }
                myChart.resize();
              }
            });

            ctrl.events.on('render', function (data) {
              renderPanel(data);
              ctrl.renderingCompleted();
            });
          }
        }]);

        return ChartCtrl;
      }(MetricsPanelCtrl));

      _export('ChartCtrl', ChartCtrl);

      ChartCtrl.templateUrl = 'partials/module.html';
    }
  };
});
//# sourceMappingURL=chart_ctrl.js.map
