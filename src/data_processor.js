import * as utils from './utils'
import * as cons from './constans'
import moment from 'moment'
import * as chartCtrl from './chart_ctrl'

let _orderData
let _orderDimensions

/**
 * Expecting columns names, and rows values
 * Return {col-1 : value-1, col-2 : value-2 .....}
 * @param {*} rowCols
 * @param {*} rows
 */
export function restructuredData (rowCols, rows) {
  const data = []
  const cols = rowCols.reduce((arr, c) => {
    const col = c.text.toLowerCase()
    arr.push(col)
    return arr
  }, [])
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const serise = {}
    for (let k = 0; k < cols.length; k++) {
      const col = cols[k]
      serise[col] = row[k]
    }
    data.push(serise)
  }

  if (data.length === 0) {
    return []
  }

  return tailorData(data, rowCols)
}

function tailorData (data, rowCols) {
  // url for writing influxdb data
  const influxUrl = utils.influxHost + 'write?db=smart_factory'

  // sort
  if (data.length > 1) {
    data = data.sort(
      (a, b) => (a.production_line > b.production_line ? -1 : a.production_line < b.production_line ? 1 : 0)
    )
  }

  // make order_data and its dimensions
  const orderData = takeOfKeys(data)

  let orderDimensions = rowCols.reduce((arr, col) => {
    arr.push(col.text.toLowerCase())
    return arr
  }, [])

  // find distinct lines
  let lines = data.reduce((arr, d) => {
    arr.push(d.production_line)
    return arr
  }, [])
  lines = utils.findDistinct(lines)

  // make line_data to match the dimension, which is expected by the chart option data
  const lineData = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const l = line.split(' | ')
    const item = [l[0] + ' | ' + l[1], l[2], i, line]
    lineData.push(item)
  }

  const lineDimensions = ['SiteArea', 'Line', 'Index', 'ProductionLine']

  // add elems to the dimension, which are expected by the option
  const positioningDimensions = ['index', 'startTime', 'endTime']
  orderDimensions = positioningDimensions.concat(orderDimensions)

  // add elems to the order_data to match the dimension
  for (let i = 0; i < orderData.length; i++) {
    const d = data[i]
    const index = matchIndex(d.production_line, lineData)
    data[i].index = index
    const positioningData = [index, 0, 0]
    orderData[i] = positioningData.concat(orderData[i])
  }

  // categorise the order_data, group by line, and in each lineGroup, group by date
  const categorisedOrders = categoriseByLineAndDate(orderData, 'array', data)
  const promises = []
  for (let i = 0; i < categorisedOrders.length; i++) {
    const lineGroup = categorisedOrders[i]
    for (let c = 0; c < lineGroup.length; c++) {
      const dateGroup = lineGroup[c]
      let _startTime = 0

      // filter out two groups, one is with startTime initalised, one is not.
      const STkey = 'scheduled_start_datetime'
      const dateGroupWithTime = dateGroup.filter(
        (order) => order[findIndex(STkey, orderDimensions)] !== null && order[findIndex(STkey, orderDimensions)] !== undefined
      )
      const dateGroupWithoutTime = dateGroup.filter(
        (order) =>
          order[findIndex(STkey, orderDimensions)] === null || order[findIndex(STkey, orderDimensions)] === undefined
      )

      // loop thro the date group containing orders that are with time
      for (let wt = 0; wt < dateGroupWithTime.length; wt++) {
        const order = dateGroupWithTime[wt]
        const startTime = order[findIndex(STkey, orderDimensions)]
        const endtime = order[findIndex('scheduled_end_datetime', orderDimensions)]

        if (_startTime === 0) {
          _startTime = moment(endtime)
        } else {
          // start time has been initialised, check if the end time is after the initialised start time
          if (_startTime.isBefore(moment(endtime))) {
            // if yes, update the starttime again
            _startTime = moment(endtime)
          }
        }

        // update order's startTime and endTime
        order[findIndex('startTime', orderDimensions)] = startTime
        order[findIndex('endTime', orderDimensions)] = endtime

        let changeoverDuration = order[findIndex('planned_changeover_time', orderDimensions)]
        if (changeoverDuration !== '0:00:00') {
          // if the order has changeover time
          changeoverDuration = moment.duration(changeoverDuration)
          const changeoverStartTime = moment(startTime).subtract(changeoverDuration)
          const changeover = utils.copyObject(order)
          changeover[findIndex('endTime', orderDimensions)] = startTime // changeover's end time = main order's start time
          changeover[findIndex('startTime', orderDimensions)] = changeoverStartTime.valueOf() // changeover's start time = it's end time - it's changeover time
          changeover[findIndex('status', orderDimensions)] = cons.STATE_CHANGEOVER // set statuts to be changeover
          orderData.push(changeover)
        }
      }

      // loop thro the date group containing orders that are with NO time
      for (let o = 0; o < dateGroupWithoutTime.length; o++) {
        const order = dateGroupWithoutTime[o]
        const lineDefaultStartTime = utils.getLineStartTime(
          order[findIndex('production_line', orderDimensions)]
        )
        // if there is no startTime, init it with the order_date and lineDefaultStartTime
        if (_startTime === 0) {
          _startTime = order[findIndex('order_date', orderDimensions)] + ' ' + lineDefaultStartTime
          _startTime = moment(_startTime, 'YYYY-MM-DD H:mm:ss')
        }

        // get startTime, then calc the order's duration based on qty and rate, then calc the endTime
        const currentStartTime = _startTime.valueOf()
        const duration = order[findIndex('order_qty', orderDimensions)] / (order[findIndex('planned_rate', orderDimensions)] * 60)
        const _endTime = _startTime.add(duration, 'hours')

        // handle changeover
        let changeoverDuration = order[findIndex('planned_changeover_time', orderDimensions)]
        if (changeoverDuration !== '0:00:00') {
          // if the order has changeover time
          changeoverDuration = moment.duration(changeoverDuration)
          const changeover = utils.copyObject(order)
          changeover[findIndex('startTime', orderDimensions)] = currentStartTime // changeover's start time = current start time
          changeover[findIndex('endTime', orderDimensions)] = moment(currentStartTime)
            .add(changeoverDuration)
            .valueOf() // changeover's end time = main order's start time
          changeover[findIndex('status', orderDimensions)] = cons.STATE_CHANGEOVER // set statuts to be changeover

          orderData.push(changeover)

          // update the order's startTime and endTime
          order[findIndex('startTime', orderDimensions)] = moment(currentStartTime)
            .add(changeoverDuration)
            .valueOf()
          order[findIndex('endTime', orderDimensions)] = _endTime.add(changeoverDuration).valueOf()
        } else {
          // update the order's startTime and endTime
          order[findIndex('startTime', orderDimensions)] = currentStartTime
          order[findIndex('endTime', orderDimensions)] = _endTime.valueOf()
        }

        // update each order to the database
        const line = writeLine(utils.mergeKeyVal(order, orderDimensions))
        promises.push(utils.post(influxUrl, line))
      }
    }
  }

  if (promises.length > 0) {
    // do nothing if requests are successful, popup the error if failed.
    Promise.all(promises)
      .then((res) => {
        chartCtrl.refreshDashb()
      })
      .catch((e) => {
        utils.alert('error', 'Influxdb Error', 'An error occurred while updating data : ' + e)
      })
  }

  // set order data and its dimension global because it will be required later from other files
  _orderData = orderData
  _orderDimensions = orderDimensions

  // Echart automatically convert number String to Int, so need to add some extra non-num String to avoid this
  // Will need to String.replace('###', '') when use it
  orderData.forEach((e) => {
    const productIdApi = e[findIndex('product_id', orderDimensions)] + '###'
    e.push(productIdApi)
  })
  orderDimensions.push('product_id_api')

  // return the expect option data
  return {
    order: { data: orderData, dimensions: orderDimensions },
    line: { data: lineData, dimensions: lineDimensions }
  }
}

function matchIndex (key, lines) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (key === line[3]) {
      return line[2]
    }
  }
  return -1
}

function takeOfKeys (data) {
  return data.map(Object.values)
}

/**
 * Expecting an array of arrays, categorise the inner arrays by line
 */
function categoriseByLineAndDate (data, key, obj) {
  const result = []

  for (let i = 0; i < data.length; i++) {
    const elem = data[i]
    const objdata = obj[i]

    let dates = obj.filter((d) => d.production_line === objdata.production_line).map((d) => d.order_date)
    dates = Array.from(new Set(dates))
    const dateIndex = findIndex(objdata.order_date, dates)

    if (result[objdata.index]) {
      if (result[objdata.index][dateIndex]) {
        result[objdata.index][dateIndex].push(elem)
      } else {
        result[objdata.index].push([])
        result[objdata.index][dateIndex].push(elem)
      }
    } else {
      result.push([])
      if (result[objdata.index][dateIndex]) {
        result[objdata.index][dateIndex].push(elem)
      } else {
        result[objdata.index].push([])
        result[objdata.index][dateIndex].push(elem)
      }
    }
  }

  return result
}

export function findIndex (key, array) {
  return array.indexOf(key)
}

function writeLine (data) {
  // For influxdb tag keys, must add a forward slash \ before each space
  // let product_desc = data.product_desc.split(' ').join('\\ ')

  let line = `OrderPerformance,order_id=${data.order_id},product_id=${data.product_id} `

  if (data.compl_qty !== null && data.compl_qty !== undefined) {
    line += 'compl_qty=' + data.compl_qty + ','
  }
  if (data.machine_state !== null && data.machine_state !== undefined) {
    line += 'machine_state="' + getRid(data.machine_state) + '"' + ','
  }

  line += 'order_state="' + getRid(data.status) + '"' + ','
  line += 'product_desc="' + getRid(data.product_desc) + '"' + ','
  line += 'order_date="' + data.order_date + '"' + ','
  line += 'production_line="' + getRid(data.production_line) + '"' + ','
  line += 'planned_changeover_time="' + data.planned_changeover_time + '"' + ','
  line += 'order_qty=' + data.order_qty + ','
  line += 'scheduled_end_datetime=' + data.endTime + ','
  line += 'scheduled_start_datetime=' + data.startTime + ','
  line += 'setpoint_rate=' + 0 + ','
  line += 'planned_rate=' + data.planned_rate

  return line
}

function getRid (x) {
  return x.split('"').join('\\"')
}

export function getColor (status) {
  let color
  switch (status.toLowerCase()) {
    case cons.STATE_CHANGEOVER:
      color = '#c9c52a'
      break
    case cons.STATE_PLAN:
      color = '#c9c9c9'
      break
    case cons.STATE_READY:
      color = '#CCFFAF'
      break
    case cons.STATE_FLAG:
      color = '#FFFB85'
      break
    case cons.STATE_PAUSE:
      color = '#E8B20C'
      break
    case cons.STATE_COMPLETE:
      color = '#70C6FF'
      break
    case cons.STATE_CLOSE:
      color = '#FF7773'
      break
    case cons.STATE_START:
      color = '#91F449'
      break
    default:
      color = '#fff'
      break
  }
  return color
}

export function getData () {
  return utils
    .mergeKeyArrayVal(_orderData, _orderDimensions)
    .filter((order) => order.status.toLowerCase() !== cons.STATE_CHANGEOVER)
}
