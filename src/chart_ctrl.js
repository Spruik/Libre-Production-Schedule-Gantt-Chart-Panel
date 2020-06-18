import angular from 'angular';
import moment from 'moment';
import _ from 'lodash';
import $ from 'jquery';
import * as dp from './data_processor';
import * as chart from './chart_option';
import * as utils from './utils';
import * as cons from './constans';
import echarts from './libs/echarts.min';
import { MetricsPanelCtrl } from 'app/plugins/sdk';

import './css/style.css!';
import './css/bootstrap-slider.css!';
import './css/instant-search.css!';
import './css/timepicker.css!';
import './css/datepicker.css!';

let _ctrl;

const panelDefaults = {
	targets: [ {} ],
	pageSize: null,
	showHeader: true,
	styles: [],
	columns: [],
	fontSize: '100%'
};

export class ChartCtrl extends MetricsPanelCtrl {
	constructor($scope, $injector, templateSrv, annotationsSrv, $sanitize, variableSrv) {
		super($scope, $injector);

		this.pageIndex = 0;

		if (this.panel.styles === void 0) {
			this.panel.styles = this.panel.columns;
			this.panel.columns = this.panel.fields;
			delete this.panel.columns;
			delete this.panel.fields;
		}

		_.defaults(this.panel, panelDefaults);

		this.events.on('data-received', this.onDataReceived.bind(this));
		this.events.on('data-error', this.onDataError.bind(this));
		this.events.on('data-snapshot-load', this.onDataReceived.bind(this));

		this.hasData = false;
	}

	issueQueries(datasource) {
		this.pageIndex = 0;

		if (this.panel.transform === 'annotations') {
			this.setTimeQueryStart();
			return this.annotationsSrv
				.getAnnotations({
					dashboard: this.dashboard,
					panel: this.panel,
					range: this.range
				})
				.then((annotations) => {
					return { data: annotations };
				});
		}

		return super.issueQueries(datasource);
	}

	onDataError(err) {
		this.dataRaw = [];
		this.render();
	}

	onDataReceived(dataList) {
		// console.log('o', utils.copyObject(dataList))
		if (dataList.length === 0 || dataList === null || dataList === undefined) {
			// console.log('No data reveived')
			this.hasData = false;
			return;
		}

		// time range
		const from = this.templateSrv.timeRange.from;
		const to = this.templateSrv.timeRange.to;

		dataList = this.filter(dataList, from, to); // filter out those with status of 'replaced' or 'deleted' and those that are not in the time range
		if (dataList[0].rows.length === 0) {
			this.hasData = false;
			return;
		} else {
			this.hasData = true;
		}

		if (dataList[0].type !== 'table') {
			console.log('To show the pie chart, please format data as a TABLE in the Metrics Setting');
			return;
		}

		//if everything is all good, start getting production line details (start time) from postgresdb
		utils.queryProductionLineDetails(callback);

		let self = this;
		function callback() {
			//dataList data is messy and with lots of unwanted data, so we need to filter out data that we want -
			let data = dp.restructuredData(dataList[0].columns, dataList[0].rows);
			if (data.length === 0) {
				return;
			}
			self.render(data);
		}
	}

	// 1. filter out records that are not of status of 'Replaced'
	// 2. filter out records that are not in the time range
	filter(dataList, from, to) {
		if (dataList.length === 0) {
			return dataList;
		}

		let rows = dataList[0].rows;
		rows = rows.filter((row) => {
			const lowerCaseRow = row.map((elem) => (typeof elem === 'string' ? elem.toLowerCase() : elem));
			if (lowerCaseRow.indexOf(cons.STATE_REPLACED) === -1 && lowerCaseRow.indexOf(cons.STATE_DELETED) === -1) {
				if (!row[8]) {
					return row;
				} // at the first time the start time will be null, let it in for now, and the time will be assigned, which will be examined later
				const scheduledStartTimeTimeStamp = row[8]; // the scheduled start time is the 10th elem
				const scheduledStartTime = moment(scheduledStartTimeTimeStamp); // moment shcedule start time
				const changeover = moment.duration(row[10], 'H:mm:ss'); // moment changeover
				scheduledStartTime.subtract(changeover); // start time - changeover to have the initial time
				if (scheduledStartTime.isSameOrAfter(from) && scheduledStartTime.isSameOrBefore(to)) {
					// if scheduled start time >= $from && <= $to
					return row;
				}
			}
		});
		dataList[0].rows = rows;
		//console.log('d', dataList)
		return dataList;
	}

	rendering() {
		this.render(this.globe_data);
	}

	link(scope, elem, attrs, ctrl) {
		const $panelContainer = elem.find('#production-schedule-gantt-chart')[0];
		const myChart = echarts.init($panelContainer);
		_ctrl = ctrl;

		function renderPanel(data) {
			if (!myChart || !data) {
				return;
			}
			const option = chart.getOption(data, _ctrl.timeSrv);
			// myChart.clear();
			myChart.setOption(option);
			setTimeout(() => {
				$('#production-schedule-gantt-chart').height(ctrl.height - 51);
				myChart.resize();
				window.onresize = () => {
					myChart.resize();
				};
			}, 500);

			chart.interationSetup(myChart, ctrl);
		}

		ctrl.events.on('panel-size-changed', () => {
			if (myChart) {
				const height = ctrl.height - 51;
				if (height >= 280) {
					$('#production-schedule-gantt-chart').height(height);
				}
				myChart.resize();
			}
		});

		ctrl.events.on('render', (data) => {
			renderPanel(data);
			ctrl.renderingCompleted();
		});
	}
}

export function refreshDashb() {
	_ctrl.timeSrv.refreshDashboard();
}

ChartCtrl.templateUrl = 'partials/module.html';
