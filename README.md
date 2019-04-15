# smart-factory-production-schedule-gantt-chart-panel
A Production Schedule Gantt Chart Panel with drag-and-drop enabled for scheduling and rescheduling orders.

## Influxdb Query example: 
SELECT "Site", "Area", "Line", "duration", "durationInt", "execute", "held", "idle", "stopped", "complete", "category", "reason", "comment", "parentReason" FROM "Availability"  WHERE $timeFilter

## Data format
Data MUST be formatted as a TABLE !

## Installation
* Simply clone this repo into `var/lib/grafana/plugins` or `data/plugins` (relative to grafana git repo if you’re running development version from source dir). For more information please go to the [Developer Guide \| Grafana Documentation](http://docs.grafana.org/plugins/developing/development/)
* `npm install`
* `npm run-script build` or just simply `grunt`
* `grunt watch` for development