import * as utils from './utils'
import * as cons from './constans'
import moment from 'moment'
import * as chartCtrl from './chart_ctrl'

let _order_data
let _order_dimensions

/**
 * Expecting columns names, and rows values
 * Return {col-1 : value-1, col-2 : value-2 .....}
 * @param {*} rowCols 
 * @param {*} rows 
 */
export function restructuredData (rowCols, rows) {
  let data = []
  let cols = rowCols.reduce((arr, c) => {
    const col = c.text.toLowerCase()
    arr.push(col)
    return arr
  }, [])
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    let serise = {}
    for (let k = 0; k < cols.length; k++) {
      const col = cols[k]
      serise[col] = row[k]
    }
    data.push(serise)
  }

  if (data.length === 0) {return []}  

  return tailorData(data, rowCols)
}

function tailorData(data, rowCols) {
  
  //url for writing influxdb data
  const influxUrl = utils.influxHost + 'write?db=smart_factory'

  //sort
  if (data.length > 1) {
    data = data.sort((a, b) => (a.production_line > b.production_line) ? -1 : (a.production_line < b.production_line) ? 1 : 0)
  }
  
  //make order_data and its dimensions
  let order_data = takeOfKeys(data)
 
  let order_dimensions = rowCols.reduce((arr, col) => {
    arr.push(col.text.toLowerCase())
    return arr
  }, [])

  //find distinct lines
  let lines = data.reduce((arr, d) => {
    arr.push(d.production_line)
    return arr
  }, [])
  lines = utils.findDistinct(lines)

  //make line_data to match the dimension, which is expected by the chart option data
  let line_data = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const l = line.split(' | ')
    const item = [l[0] + ' | ' + l[1], l[2], i, line]
    line_data.push(item)
  }
  
  let line_dimensions = ['SiteArea', 'Line', 'Index', 'ProductionLine']

  //add elems to the dimension, which are expected by the option
  const positioning_dimensions = ['index', 'startTime', 'endTime']
  order_dimensions = positioning_dimensions.concat(order_dimensions)

  //add elems to the order_data to match the dimension
  for (let i = 0; i < order_data.length; i++) {
    const d = data[i]
    const index = matchIndex(d.production_line, line_data)
    data[i]["index"] = index
    const positioning_data = [index, 0, 0]
    order_data[i] = positioning_data.concat(order_data[i])
  }

  //categorise the order_data, group by line, and in each lineGroup, group by date
  const categorisedOrders = categoriseByLineAndDate(order_data, 'array', data)
  //console.log(categorisedOrders)
  let promises = []
  for (let i = 0; i < categorisedOrders.length; i++) {
    const lineGroup = categorisedOrders[i]
    for (let c = 0; c < lineGroup.length; c++) {
      const dateGroup = lineGroup[c];
      let _startTime = 0
      
      //filter out two groups, one is with startTime initalised, one is not.
      const STkey = 'scheduled_start_datetime'
      const dateGroupWithTime = dateGroup.filter(order => order[findIndex(STkey, order_dimensions)] !== null && order[findIndex(STkey, order_dimensions)] !== undefined)
      const dateGroupWithoutTime = dateGroup.filter(order => order[findIndex(STkey, order_dimensions)] === null || order[findIndex(STkey, order_dimensions)] === undefined)
      
      //loop thro the date group containing orders that are with time
      for (let wt = 0; wt < dateGroupWithTime.length; wt++) {
        const order = dateGroupWithTime[wt];
        const startTime = order[findIndex(STkey, order_dimensions)]
        const endtime = order[findIndex('scheduled_end_datetime', order_dimensions)]

        if (_startTime === 0) {
          _startTime = moment(endtime)
        }else {
          //start time has been initialised, check if the end time is after the initialised start time
          if(_startTime.isBefore(moment(endtime))){
            //if yes, update the starttime again
            _startTime = moment(endtime)
          }
        }

        //update order's startTime and endTime
        order[1] = startTime
        order[2] = endtime    
        
        let changeover_duration = order[findIndex('planned_changeover_time',order_dimensions)]
        if (changeover_duration !== '0:00:00'){ 
          //if the order has changeover time
          changeover_duration = moment.duration(changeover_duration)
          const changeover_startTime = moment(startTime).subtract(changeover_duration)
          let changeover = utils.copyObject(order)
          changeover[2] = startTime // changeover's end time = main order's start time
          changeover[1] = changeover_startTime.valueOf() // changeover's start time = it's end time - it's changeover time
          changeover[8] = cons.STATE_CHANGEOVER // set statuts to be changeover
          order_data.push(changeover)
        }
      }

      //console.log(dateGroupWithoutTime)

      //loop thro the date group containing orders that are with NO time
      for (let o = 0; o < dateGroupWithoutTime.length; o++) {
        const order = dateGroupWithoutTime[o];
        let lineDefaultStartTime = utils.getLineStartTime(order[findIndex('production_line', order_dimensions)])
        //if there is no startTime, init it with the order_date and lineDefaultStartTime
        if (_startTime === 0) {
          _startTime = order[findIndex('order_date',order_dimensions)] + ' ' + lineDefaultStartTime
          _startTime = moment(_startTime, 'YYYY-MM-DD H:mm:ss')
        }

        //get startTime, then calc the order's duration based on qty and rate, then calc the endTime
        let currentStartTime = _startTime.valueOf()
        let duration = order[findIndex('order_qty',order_dimensions)] / (order[findIndex('planned_rate',order_dimensions)] * 60)
        console.log(duration)
        let _endTime = _startTime.add(duration, 'hours')

        //handle changeover
        let changeover_duration = order[findIndex('planned_changeover_time',order_dimensions)]
        if (changeover_duration !== '0:00:00'){ 

          //if the order has changeover time
          changeover_duration = moment.duration(changeover_duration)
          let changeover = utils.copyObject(order)
          changeover[1] = currentStartTime // changeover's start time = current start time
          changeover[2] = moment(currentStartTime).add(changeover_duration).valueOf() // changeover's end time = main order's start time
          changeover[8] = cons.STATE_CHANGEOVER // set statuts to be changeover

          order_data.push(changeover)

          //update the order's startTime and endTime
          order[1] = moment(currentStartTime).add(changeover_duration).valueOf()
          order[2] = _endTime.add(changeover_duration).valueOf()
        }else {
          //update the order's startTime and endTime
          order[1] = currentStartTime
          order[2] = _endTime.valueOf()
        }
  
        //update each order to the database
        const line = writeLine(utils.mergeKeyVal(order, order_dimensions))
        promises.push(utils.post(influxUrl, line))
      }
    }
  }

  if (promises.length > 0) {
    //do nothing if requests are successful, popup the error if failed.
    Promise.all(promises).then(res => {
      chartCtrl.refreshDashb()
    }).catch(e => {
      utils.alert('error', 'Influxdb Error', 'An error occurred while updating data : ' + e)
    })
  }

  //set order data and its dimension global because it will be required later from other files
  _order_data = order_data
  _order_dimensions = order_dimensions

  // Echart automatically convert number String to Int, so need to add some extra non-num String to avoid this
  // Will need to String.replace('###', '') when use it
  order_data.forEach(e => {
    const product_id_api = e[findIndex('product_id', order_dimensions)] + '###'
    e.push(product_id_api)
  })
  order_dimensions.push('product_id_api')

  //return the expect option data
  return {
    order: {data: order_data, dimensions: order_dimensions},
    line: {data: line_data, dimensions: line_dimensions}
  }
}

function matchIndex(key, lines){
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (key === line[3]) {
      return line[2]
    }
  }
  return -1
}

function takeOfKeys(data) {
  return data.map( Object.values )
}

/**
 * Expecting an array of arrays, categorise the inner arrays by line
 */
function categoriseByLineAndDate(data, key, obj){
  let result = []
  
  for (let i = 0; i < data.length; i++) {
    const elem = data[i];
    const objdata = obj[i]
    
    let dates = obj.filter(d => d.production_line === objdata.production_line).map(d => d.order_date)
    dates = Array.from(new Set(dates))
    const dateIndex = findIndex(objdata.order_date, dates)
    
    if (result[objdata.index]) {
      if (result[objdata.index][dateIndex]) {
        result[objdata.index][dateIndex].push(elem)
      }else{
        result[objdata.index].push([])
        result[objdata.index][dateIndex].push(elem)
      }
    }else {
      result.push([])
      if (result[objdata.index][dateIndex]) {
        result[objdata.index][dateIndex].push(elem)
      }else{
        result[objdata.index].push([])
        result[objdata.index][dateIndex].push(elem)
      }
    }
  }

  return result
}

export function findIndex(key, array){
  return array.indexOf(key)
}

function writeLine(data){  
  //For influxdb tag keys, must add a forward slash \ before each space   
  let product_desc = data.product_desc.split(' ').join('\\ ')
  
  let line = 'OrderPerformance,order_id=' + data.order_id + ',product_id=' + data.product_id + ',product_desc=' + product_desc + ' '

  if (data.compl_qty !== null && data.compl_qty !== undefined) {
    line += 'compl_qty=' + data.compl_qty + ','
  }

  line += 'order_state="' + data.status + '"' + ','
  line += 'order_date="' + data.order_date + '"' + ','
  line += 'production_line="' + data.production_line + '"' + ','
  line += 'planned_changeover_time="' + data.planned_changeover_time + '"' + ','
  line += 'order_qty=' + data.order_qty + ','
  line += 'scheduled_end_datetime=' + data.endTime + ','
  line += 'scheduled_start_datetime=' + data.startTime + ','
  line += 'setpoint_rate=' + 0 + ','
  line += 'planned_rate=' + data.planned_rate

  return line
}

export function getColor(status){
  let color
  switch (status.toLowerCase()) {
    case cons.STATE_CHANGEOVER:
      color = '#c9c52a'
      break;
    case cons.STATE_PLAN:
      color = '#c9c9c9'
      break;
    case cons.STATE_READY:
      color = '#CCFFAF'
      break;
    case cons.STATE_FLAG:
      color = '#FFFB85'
      break;
    case cons.STATE_PAUSE:
      color = '#E8B20C'
      break;
    case cons.STATE_COMPLETE:
      color = '#70C6FF'
      break;
    case cons.STATE_CLOSE:
      color = '#FF7773'
      break;
    case cons.STATE_START:
      color = '#91F449'
      break;
    default:
      color = '#fff'
      break;
  }
  return color
}

export function getData(){
  return utils.mergeKeyArrayVal(_order_data, _order_dimensions).filter(order => order.status.toLowerCase() !== cons.STATE_CHANGEOVER)
}