
CREATE TABLE schedule (Time timestamp, order_id varchar(20), product_id varchar(20), order_date date, Status varchar(20), order_qty integer, planned_rate integer, production_line varchar(50), scheduled_start_datetime timestamp, scheduled_end_datetime timestamp, planned_changeover_time time, compl_qty integer, actual_start_datetime timestamp, actual_end_datetime timestamp, setpoint_rate integer, product_desc varchar(20));

/* Equipment */
CREATE TABLE equipment (
  site character varying(50) NULL,
  area character varying(50) NULL,
  production_line character varying(50) NULL,
  equipment character varying(50) NULL,
  start_time character varying(10) NULL
);

INSERT INTO schedule (Time, order_id, product_desc, product_id, order_date, Status, order_qty, planned_rate, production_line, scheduled_start_datetime, scheduled_end_datetime, planned_changeover_time, compl_qty) VALUES ('2020-06-17T19:11:44.000Z', '4', 'Cheese Pizza', '1', '2020-06-19', 'ready', 123545, 15, 'Site | Area | Line1', '2020-06-19T07:00:00.000Z', '2020-06-19T20:43:00.000Z', '00:00:00', null);
INSERT INTO schedule (Time, order_id, product_desc, product_id, order_date, Status, order_qty, planned_rate, production_line, scheduled_start_datetime, scheduled_end_datetime, planned_changeover_time, compl_qty) VALUES ('2020-06-17T19:11:44.000Z', '2', 'Cheese Pizza', '1', '2020-06-18', 'next', 123467, 123, 'Site | Area | Line1', '2020-06-18T07:59:00.000Z', '2020-06-19T00:42:42.000Z', '00:59:00', null);
INSERT INTO schedule (Time, order_id, product_desc, product_id, order_date, Status, order_qty, planned_rate, production_line, scheduled_start_datetime, scheduled_end_datetime, planned_changeover_time, compl_qty) VALUES ('2020-06-17T19:11:20.000Z', '1', 'Cheese Pizza', '1', '2020-06-17', 'paused', 123467, 123, 'Site | Area | Line1', '2020-06-17T07:15:00.000Z', '2020-06-17T23:58:42.000Z', '00:15:00', null);
INSERT INTO schedule (Time, order_id, product_desc, product_id, order_date, Status, order_qty, planned_rate, production_line, scheduled_start_datetime, scheduled_end_datetime, planned_changeover_time, compl_qty) VALUES ('2020-06-17T19:08:50.000Z', '3', 'Cheese Pizza', '1', '2020-06-17', 'ready', 123123, 123, 'Site | Area | Line2', '2020-06-17T07:00:00.000Z', '2020-06-17T23:41:00.000Z', '00:00:00', null);


INSERT INTO equipment (site) VALUES ('Site');
INSERT INTO equipment (site, area) VALUES ('Site', 'Area');
INSERT INTO equipment (site, area, production_line) VALUES ('Site', 'Area', 'Line1');
INSERT INTO equipment (site, area, production_line) VALUES ('Site', 'Area', 'Line2');