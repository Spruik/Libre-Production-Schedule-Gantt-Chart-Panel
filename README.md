# Libre Production Schedule Gantt Chart

> Libre Gantt Chart Panel to visually schedule Production Orders on Lines

This panel enables users to quickly visualize and navigate production line schedules in time with changeover and order duration styled differently. Users can enable edit mode and reschedule orders by click and dragging orders in time and even reschedule across production lines. Order start times are validated against the start time of the production line when dragging orders. This panel is part of [Libre](https://github.com/Spruik/Libre) suite of Grafana plugins and dashbaords. This plugin interfaces to a no security json rest api for data running on the same grafana server. This panel is targeted at Grafana v6.x.x only.

![Panel](./docs/libre-production-schedule-gantt-chart-panel.png)

## Installation

The easiest way to get started with this plugin is to [download the latest release](https://github.com/Spruik/Libre-Production-Schedule-Gantt-Chart-Panel/releases/latest/download/libre-production-schedule-gantt-chart-panel.zip), unzip into grafana plugin directory and restart grafana.

Download the latest release

```shell
$ wget https://github.com/Spruik/Libre-Production-Schedule-Gantt-Chart-Panel/releases/latest/download/libre-production-schedule-gantt-chart-panel.zip
Resolving github.com (github.com)... 140.82.114.4
...
2020-06-24 20:47:59 (1.08 MB/s) - 'libre-production-schedule-gantt-chart-panel.zip' saved [90150]
```

Unzip into your Grafana plugin directory

```shell
$ unzip libre-production-schedule-gantt-chart-panel.zip -d /var/lib/grafana/plugins
Archive: libre-production-schedule-gantt-chart-panel.zip
...
inflating: /var/lib/grafana/libre-production-schedule-gantt-chart-panel/utils.js.map
```

Restart Grafana

```shell
$ service grafana-server restart
 * Stopping Grafana Server
 * Starting Grafana Server
```

## Usage

In order to get the most out of this panel:

1. Add a *Table* metric to query the schedule. For example:

```influx
SELECT
  "order_date"
  ,last("order_state") as Status
  ,"order_qty"
  ,"planned_rate"
  ,"production_line"
  ,"scheduled_start_datetime"
  ,"scheduled_end_datetime"
  ,"planned_changeover_time"
  ,"compl_qty"
  ,"actual_start_datetime"
  ,"actual_end_datetime"
  ,"setpoint_rate"
  ,"product_desc"
FROM "OrderPerformance"
WHERE $timeFilter
GROUP BY "order_id", "product_id"
```

![Metrics](./docs/libre-production-schedule-gantt-chart-panel-metrics.png)

### Editting

To move orders in time and across production lines. Enable editting using the panel tool button. Click and drag order in time or across lines. Release the click to confirm your action.

Business rules are applied in the following situations:

- Running, Complete or Closed Orders cannot be moved
- Orders cannot be run before the start time for that production line
- Orders cannot overlap, user will be prompted to existing orders left or right, or cancel the move

## Developing

### Getting Started

A docker-compose and grunt script is provided in order to quickly evaluate source code changes. This requires

Prerequisites

- docker (>= 18 required)
- docker-compose (>= 1.25 required)
- node (>= 12 required)
- npm (>= 6 required)

Start by cloning this repository

```shell
~/
$ git clone https://github.com/Spruik/Libre-Production-Schedule-Gantt-Chart-Panel
Cloning into 'Libre-Production-Schedule-Gantt-Chart-Panel'...
remote: Enumerating objects: 46, done.
remote: Counting objects: 100% (46/46), done.
remote: Compressing objects: 100% (31/31), done.
remote: Total 46 (delta 13), reused 46 (delta 13), pack-reused 0
Unpacking objects: 100% (46/46), done.
```

Enter project and install dependencies

```shell
$ cd ./Libre-Production-Schedule-Gantt-Chart-Panel
~/Libre-Production-Schedule-Gantt-Chart-Panel
$ npm install
...
added 636 packages in 14.511s
```

Install Grunt globally

```shell
$ npm install grunt -g
C:\Users\user\AppData\Roaming\npm\grunt -> C:\Users\user\AppData\Roaming\npm\node_modules\grunt\bin\grunt
+ grunt@1.1.0
updated 1 package in 1.364s
```

Run grunt to build the panel

```shell
~/Libre-Production-Schedule-Gantt-Chart-Panel
$ grunt
Running "clean:0" (clean) task
>> 1 path cleaned.

Running "clean:1" (clean) task
>> 0 paths cleaned.

Running "clean:2" (clean) task
>> 1 path cleaned.

Running "copy:src_to_dist" (copy) task
Created 4 directories, copied 13 files

Running "copy:libs" (copy) task
Copied 2 files

Running "copy:readme" (copy) task
Created 1 directory, copied 5 files

Running "string-replace:dist" (string-replace) task

1 files created

Running "copy:echarts_libs" (copy) task
Copied 1 file

Running "copy:pluginDef" (copy) task
Copied 1 file

Running "copy:image_to_dist" (copy) task


Running "babel:dist" (babel) task

Done.

```

Start docker-compose.dev.yml detached

```shell
~/Libre-Production-Schedule-Gantt-Chart-Panel
$ docker-compose -f docker-compose.dev.yaml up -d
Creating network "libre-production-schedule-gantt-chart-panel_default" with the default driver
Creating libre-production-schedule-gantt-chart-panel_postgres_1 ... done
Creating libre-production-schedule-gantt-chart-panel_grafana_1  ... done
Creating libre-production-schedule-gantt-chart-panel_postREST_1 ... done

```

Run grunt watch to recompile on change

```shell
~/Libre-Production-Schedule-Gantt-Chart-Panel
$ grunt watch
Running "watch" task
Waiting...
```

Open your favourite editor and start editing ./src files. The grunt watch task will detect this and recompile the panel. Use your favourite web browser and point to http://localhost:3000 login and create a dashboard with this panel. Your browser will need to be refreshed to reflect your changes to this panel, ensure your browser isn't caching files.

### Building

Prerequisites

- node (>= 12 required)
- npm (>= 6 required)

Build panel and zip into archive

```shell
~/Libre-Production-Schedule-Gantt-Chart-Panel
$ grunt build
Running "clean:0" (clean) task
>> 1 path cleaned.

Running "clean:1" (clean) task
>> 0 paths cleaned.

Running "clean:2" (clean) task
>> 0 paths cleaned.

Running "clean:0" (clean) task
>> 0 paths cleaned.

Running "clean:1" (clean) task
>> 0 paths cleaned.

Running "clean:2" (clean) task
>> 0 paths cleaned.

Running "copy:src_to_dist" (copy) task
Created 4 directories, copied 13 files

Running "copy:libs" (copy) task
Copied 2 files

Running "copy:readme" (copy) task
Created 1 directory, copied 5 files

Running "string-replace:dist" (string-replace) task

1 files created

Running "copy:echarts_libs" (copy) task
Copied 1 file

Running "copy:pluginDef" (copy) task
Copied 1 file

Running "copy:image_to_dist" (copy) task


Running "babel:dist" (babel) task

Running "compress:main" (compress) task
>> Compressed 54 files.

Running "compress:tar" (compress) task
>> Compressed 54 files.

Done.

```

Find a completed build of this panel in the root directory named `libre-production-schedule-gantt-chart-panel.zip`.

## Contributing

For any issue, there are fundamentally three ways an individual can contribute:

- By opening the issue for discussion: For instance, if you believe that you have uncovered a bug in, creating a new issue in the [GitHub issue tracker](https://github.com/Spruik/Libre-Production-Schedule-Gantt-Chart-Panel/issues) is the way to report it.
- By helping to triage the issue: This can be done either by providing supporting details (a test case that demonstrates a bug), or providing suggestions on how to address the issue.
- By helping to resolve the issue: Typically, this is done either in the form of demonstrating that the issue reported is not a problem after all, or more often, by opening a Pull Request that changes some bit of something in the panel in a concrete and reviewable manner.

## Change log

- 1.0.2 Add tar build output
  - Remove unused libraries
  - Fix npm audit
  - Add tar build output
  - Update README shell outputs
  - Bump Revision

- 1.0.1 Documentation Update
  - Fix subtitle & project path
  - Remove unused grunt config

- 1.0.0 Initial Public Release
