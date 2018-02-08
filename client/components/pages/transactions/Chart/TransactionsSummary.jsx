import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import { Select, CheckBox } from 'grommet';
import Layer from 'grommet/components/Layer';
import { identity, map, unionBy } from 'lodash';
import moment from 'moment'
import TransactionChart from './SummaryChart.jsx'

class SummaryChartContainer extends React.Component {
  constructor() {
    super();
    this.state = {
      chartData: {}, 
      displayAnnual: true,
      displayTotal: false,
      month: '',
      filter: {},
      filteredTransactions: [],
    }
    this.handleChartClick = this.handleChartClick.bind(this)
    this.generateMonthlyData = this.generateMonthlyData.bind(this);
    this.generateDailyData = this.generateDailyData.bind(this);
    this.renderChart = this.renderChart.bind(this);
  }

  // Formats data in preparation for chart

  generateChartDataObject (labels, data) {
    const chartData = {
      labels: labels, 
      datasets:[
      {
        label: 'Monthly Amounts',
        data: [...data],
        backgroundColor: "rgb(71, 255, 178)"
      }]
    }
    return chartData;   
  }

  // Filters transactions according to filter object in state
  // if transaction matches all properties of filter, it is returned

  filterTransactionsByValue(callback) {
    if (this.props.transactions) {
      let transactions = this.props.transactions.filter(transaction => {
        return Object.keys(this.state.filter).every((key) => {
          if (key === 'account') {
            return transaction[key][0].bank_name === this.state.filter[key];
          }
          return transaction[key] === this.state.filter[key]
        })
      })
      console.log(transactions)
      return transactions
    }
  }

  // Groups annual transactions by date

  assignToDate (transactions) {
    let dates = {};
    transactions.forEach(transaction => {
      let date = transaction.date;
      dates[date] ?
      dates[date].push(transaction) :
      dates[date] = [transaction];
    })
    return dates;
  }

    // Groups annual transactions by month

  assignToMonth (transactions) {
    let months = {};
    transactions.forEach(transaction => {
      let month = moment(transaction.date).format('MMMM')
      months[month] ?
      months[month].push(transaction) :
      months[month] = [transaction];
    })
    return months;
  }

  // Takes daily transactions and calculates total spend for the day for each date
  // then sets state to rerender the chart

  generateDailyData (transactions, month) {
    const monthlyTransactions = this.assignToMonth(transactions)[month];
    if (monthlyTransactions) {
      const dailyTransactions = this.assignToDate(monthlyTransactions)
      // for some reason map didn't like an object-like array...
      const days = [...Object.keys(dailyTransactions)];
      const amounts = days.map(day => {
        return dailyTransactions[day].reduce((a, b) => {
          return  a += Math.abs(b.amount);
        }, 0)
      })
      return this.generateChartDataObject(days, amounts);
    }
    return this.generateChartDataObject([], [])
  }

  // Takes monthly transactions and calculates total spend for the month
  // then sets state to rerender the chart

  generateMonthlyData (transactions) {
    const months = this.assignToMonth(transactions);
    const year = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const amounts = year.map(month => {
      months[month] = months[month] || [];
      return months[month].reduce((a, b) => {
        return a += Math.abs(b.amount)
      }, 0);
    });
    return this.generateChartDataObject(year, amounts);
  }

  // Below checks whether or not a month has been selected
  // if true, the chart will render daily transactions for the selected month
  // else it will reset to all transactions for the year

  handleChartClick(element) {
    let chartData, month;
    if (this.state.displayAnnual) {
      month = this.state.chartData.labels[element[0]._index];
      chartData = this.generateDailyData(this.state.filteredTransactions, month);
    } else {
      chartData = this.generateMonthlyData(this.state.filteredTransactions);
    }    
    this.setState({
      month,
      chartData,
      displayAnnual: !this.state.displayAnnual
    })
  }

  renderChart() {
    let filteredTransactions = this.filterTransactionsByValue();

    const chartData = this.state.displayAnnual ?
    this.generateMonthlyData(filteredTransactions) :
    this.generateDailyData(filteredTransactions, this.state.month);

    this.setState({
      filteredTransactions,
      chartData
    })
  }

  componentDidMount(){
    this.renderChart();
  }

  render() {
    return (
      this.props.displaySummary ?
      <Layer
        closer={true}
        overlayClose={true}
        padding="small"
        flush={true}
        onClose={this.props.handleSummary}>
        <TransactionChart 
          chartData={this.state.chartData} 
          handleChartClick={this.handleChartClick}/>
        <CheckBox label='Show Total'
          toggle={true}
          disabled={false}
          reverse={true} 
          checked={this.state.displayTotal}
          onChange={() => console.log('hello')}/>
        <Select 
          placeHolder="Select a category"
          options={this.props.categories.map(a => a[0])}
          value={this.state.filter.category}
          onChange={({value}) => {
            let { filter } = this.state;
            filter.category = value;
            this.setState({filter}, () => this.renderChart())
          }}
        />
        <Select 
          placeHolder="Select an account"
          options={this.props.accounts.map(a => a.bank_name)}
          value={this.state.filter.account}
          onChange={({value}) => {
            let { filter } = this.state;
            filter.account = value;
            this.setState({filter}, () => this.renderChart())
          }}
        />
      </Layer> :
      null
    )
  }

}

export default SummaryChartContainer;