# smart-factory-production-schedule-gantt-chart-panel
A Production Schedule Gantt Chart Panel with drag-and-drop enabled for scheduling and rescheduling orders.

## Installation
* Simply clone this repo into `var/lib/grafana/plugins` or `data/plugins` (relative to grafana git repo if you’re running development version from source dir). For more information please go to the [Developer Guide \| Grafana Documentation](http://docs.grafana.org/plugins/developing/development/)
* `npm install`
* `npm run-script build` or just simply `grunt`
* `grunt watch` for development

## Influxdb Query example: 
~~~
SELECT "order_date", last("order_state") as Status, "order_qty", "planned_rate", "production_line", "scheduled_start_datetime", "scheduled_end_datetime", "planned_changeover_time", "compl_qty" FROM "OrderPerformance" WHERE $timeFilter GROUP BY "product_desc", "order_id", "product_id"
~~~

## Data format
Data MUST be formatted as a TABLE !