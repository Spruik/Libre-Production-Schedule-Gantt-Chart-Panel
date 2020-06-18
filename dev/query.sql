SELECT
    time
    ,order_id
    ,product_id
    ,to_char(order_date, 'yyyy-mm-dd') as order_date
    ,status as "STATUS"
    ,order_qty
    ,planned_rate
    ,production_line
    ,cast(extract(epoch from scheduled_start_datetime) as bigint) * 1000 as scheduled_start_datetime
    ,cast(extract(epoch from scheduled_end_datetime) as bigint) * 1000 as scheduled_end_datetime
    ,to_char(planned_changeover_time, 'HH24:MI:SS') as planned_changeover_time
    ,compl_qty
    ,actual_start_datetime
    ,actual_end_datetime
    ,setpoint_rate
    ,product_desc
FROM schedule  