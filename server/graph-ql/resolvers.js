const jwt = require('jsonwebtoken');
const _ = require('lodash')
const plaid = require('../plaid.js')
const sendgrid = require('../sendgrid.js');
const moment = require('moment')
const Promise = require('bluebird');
const knex = require('../database/index.js').knex;

module.exports = {

  User: {
    transactions: ({ id }, args, { knex, user }) => 
      knex('transactions').where({
        user_id: id
      }),
      
    accounts: ({ id }, args, { knex }) => 
      knex('accounts').where({
        user_id: id
      }),

    school: ({ id }, args, { knex }) =>
      knex('schools').where({
        user_id: id
      }),

    banks: ({ id }, args, { knex }) =>
      knex('banks').where({
        user_id: id
      }),

    bills: ({ id }, args, { knex }) => 
      knex('bills').where({
        user_id: id
      }),
  },

  Loan: {
    user: ({ user_id }, args, { knex }) => 
      knex('users').where({
        id: user_id
      }),
    loan_payments: ({ id }, args, { knex }) =>
      knex('loan_payments').where({
        loan_id: id
      })
  },

  Loan_Payment: {
    user: ({ user_id }, args, { knex }) => 
      knex('users').where({
        id: user_id
      }),
    loan: ({ loan_id }, args, { knex }) =>
      knex('loans').where({
        id: loan_id
      })
  },

  Transaction: {
    user: ({ user_id }, args, { knex }) => 
      knex('users').where({
        id: user_id
      }),

    account: ({ account_id }, args, { knex }) => 
      knex('accounts').where({
        id: account_id
      })
  },

  Account: {
    transactions: ({ id }, args, { knex }) => 
      knex('transactions').where({
        account_id: id
      }),
    monthly_balance: ({ id }, args, { knex }) =>
      knex('monthly_balance').where({
        account_id: id
      })
  },

  Bill: {
    bill_category: ({ bill_category_id }, args, { knex }) => 
      knex('bill_categories').where({
        id: bill_category_id
      }), 
    bill_recurrence: ({ bill_recurrence_id }, args, { knex }) => 
      knex('bill_recurrence').where({
        id: bill_recurrence_id
      }),
    bill_payment_history: ({ bill_id }, args, { knex }) => 
      knex('bill_payment_history').where({
        bill_id
      })
  },

  BillCategory: {
    bills: ({ id }, args, { knex }) => 
      knex('bills').where({
        bill_category_id: id
      })
  },

  BillPaymentHistory: {
    user: ({ user_id }, args, { knex }) => 
    knex('users').where({
      id: user_id
    }),
    bills: ({ bill_id }, args, { knex }) => 
    knex('bills').where({
      id: bill_id
    })
  },

  BillRecurrence: {
    bills: ({ id }, args, { knex }) => 
      knex('bills').where({
        bill_recurrence_id: id
      })
  },


  Query: {
    getUser: (parent, args, { knex, user }) => { 
      // ADD THE BELOW LOGIC TO ANY PRIVATE ROUTES
      if (user) {
        console.log('user', user)
        return knex('users').where(args)
      } else {
        throw new Error('Not authenticated')
      }
    },

    getTransactions: (parent, { user_id }, {knex, user}) =>   
      knex('transactions').where({
        user_id: user.user.id
      }), 

    getAccounts: (parent, { user_id }, { knex, user }) => 
      knex('accounts').where({
        user_id: user.user.id
      }),

    getAccount: (parent, { account_id }, { knex }) =>
      knex('accounts').where({
        account_id
      }),
  
    getSchools: (parent, { id }, { knex }) =>
      knex.select().from('schools').where({
        id
      }),
      
    getBillCategories: (parent, { user_id }, { knex }) => 
      knex('bill_categories').where({
        user_id
      }),
    
    getBill: (parent, { id }, { knex }) => 
    knex('bills').where({
      id
    }),

    getBills: (parent, { user_id }, { knex, user }) => 
      knex('bills').where({
        user_id: user.user.id
      }),

    getLoans: (parent, { user_id }, { knex, user }) => 
      knex('loans').where({
        user_id: user.user.id
      }),
    getLoanPayments: (parent, { loan_id }, { knex }) =>
      knex('loan_payments').where({
        loan_id
      }),

    getBillPaymentHistory: (parent, { user_id }, { knex }) =>
      knex('bill_payment_history').where({
        user_id
      }),

    getBillRecurrence:  (parent, { id }, { knex }) =>
      knex('bill_recurrence').where({})      
    },

  Mutation: {
    createBankAccount: (parent, { user_id, public_key }, { knex, models, user }) => {
      plaid.exchangeToken(public_key)
      .then(res => {
        new models.Bank({ 
          user_id: user.user.id, 
          id: res.item_id, 
          access_token: res.access_token,
          last_updated: '1999-10-10'
        }).save(null, {method: 'insert'});
      })
    },

    getUpdatedTransactions: (parent, { user_id }, { knex, models, user }) => {
      console.log('')
      knex.select('*').from('banks').where({user_id: user.user.id})
      .then(banks => {
        banks.forEach(bank => {
          new models.Bank(bank).fetch()
          .then(bank => {
            const today = moment().format('YYYY-MM-DD')
            const startTime = bank.attributes.last_updated
            return bank.save({
              last_updated: today,
              previous_updated: startTime
            })
          })
          .then(bank => {
            bank = bank.attributes
            plaid.getAccountsAndTransactions(bank.access_token, bank.previous_updated)
            .then(response => {
              response.accounts.forEach(account => {
                new models.Account({id: account.account_id}).fetch()
                .then(fetchedAccount => {
                  if (fetchedAccount) {
                    fetchedAccount.save({
                      current_balance: account.balances.current_balance
                    })
                  } else {
                    new models.Account({
                      id: account.account_id,
                      user_id: bank.user_id,
                      bank_name: account.name,
                      limit: account.balances.limit,
                      current_balance: account.balances.current,
                      type: account.type,
                      bank_id: bank.id,
                    })
                    .save(null, {method: 'insert'})
                  }
                })
              })
              return response
            })
            .then(response => {
              response.transactions.map(async transaction => {
                const today = moment().format('YYYY-MM-DD');
                let category = transaction.category ? transaction.category[0] : 'UNCATEGORIZED';
                if (transaction.date !== today) {
                  return await new models.Transaction({
                    user_id: bank.user_id,
                    plaid_id: transaction.transaction_id,
                    category: category,
                    date: transaction.date,
                    account_id: transaction.account_id,
                    amount: transaction.amount,
                    name: transaction.name
                  })
                  .save(null, {method: 'insert'})
                } else {
                  return await new models.DailyTransaction({
                    user_id: bank.user_id,
                    plaid_id: transaction.transaction_id,
                    category: category,
                    date: transaction.date,
                    account_id: transaction.account_id,
                    amount: transaction.amount,
                    name: transaction.name
                  })
                  .save()
                }
              });
            })
          })
        })
      })
    },

    createUser: async (parent, args, { models, APP_SECRET }) => {
      const { email } = args;
      const exists = await new models.User({ email }).fetch();
      if (exists) {
        throw new Error('That email already exists');
      }
      const user = await new models.User(args).save();
      const token = jwt.sign({ user: _.pick(user.attributes, ['id', 'email'])}, APP_SECRET, {
        expiresIn: 360*60
      })
      
      return [token, user.attributes.id]
    },

    deleteUser: (parent, args, { knex }) => knex('users').where(args).del(),

    loginUser: async (parent, { email, password }, { models, APP_SECRET }) => {
      console.log("SERVER, CALLING LOGIN")
      const user = await new models.User({ email }).fetch();
      if (!user) {
        throw new Error('Unable to match the provided credentials');
      }
      const match = await user.comparePassword(password);
      if (!match) {
        throw new Error('Unable to match the provided credentials');
      }
      const token = jwt.sign({ user: _.pick(user.attributes, ['id', 'email'])}, APP_SECRET, {
        expiresIn: 360*60
      })
      // user.token = token;
      return [token, user.attributes.id]
      // return {id, token};
    },

    createTransaction: async (parent, args, { models }) => {
      console.log('adding transaction')
      const transaction = await new models.Transaction(args).save(null, {method: 'insert'});
      return transaction.attributes;
    },

    createAccount: async (parent, args, { knex, models }) => {
      const account = await new models.Account(args).save(null, {method: 'insert'});
      return account.attributes;
    },

    updateUser: async (parent, args, {models, knex}) => {
      const { email } = args;
      const user = await new models.User({email}).fetch();
      const { id } = user;
      for(let field in user.attributes) {
        if (args[field]) {
          user.attributes[field] = args[field]
        }
      }
      let updated = await new models.User(user.attributes).save();
      return updated.attributes
    },

    updateEmail: async (parent, args, {models, knex}) => {
      const { id } = args;
      const user = await new models.User({id}).fetch();
      const { email } = user;
      for (let field in user.attributes) {
        if (args[field]) {
          user.attributes[field] = args[field]
        }
      }
      let updated = await new models.User(user.attributes).save();
      return updated.attributes
    },

    createSchool: async (parent, args, { models }) => {
      const school = await new models.School(args).save(null, {method: 'insert'});
      return school.attributes;
    },

    addBank: async (parent, args, { models }) => {
      const bank = await new models.Bank(args).save(null, {method: 'insert'});
      return bank.attributes;
    },
    
    createBill: async (parent, args, { models }) => {
      const bill = await new models.Bill(args).save(null, {method: 'insert'});
      return bill.attributes;
     },

    updateBill: async (parent, args, { models }) => {
      const bill = await new models.Bill(args).save(null, {method: 'update'});
      return bill.attributes;
    },

    deleteBill: (parent, args, { knex }) => knex('bills').where(args).del(),

    createBillCategory: async (parent, args, { models }) => {
      const billCategory = await new models.BillCategory(args).save(null, {method: 'insert'});
      return billCategory.attributes;
    },

    updateBillCategory: async (parent, args, { models }) => {
      const billCategory = await new models.BillCategory(args).save(null, {method: 'update'});
      return billCategory.attributes;
    },

    deleteBillCategory: (parent, args, { knex }) => knex('bill_categories').where(args).del(),


    createBillRecurrence: async (parent, args, { models }) => {
      const billRecurrence = await new models.BillRecurrence(args).save(null, {method: 'insert'});
      return billRecurrence.attributes;
    },
    
    deleteBillRecurrence: async (parent, args, { knex }) => knex('bill_recurrence').where(args).del(),

    createBillPaymentHistory: async (parent, args, { models }) => {
      const billPaymentHistory = await new models.BillPaymentHistory(args).save(null, {method: 'insert'});
      return billPaymentHistory.attributes;
     },

    updateBillPaymentHistory: async (parent, args, { models }) => {
      const billPaymentHistory = await new models.BillPaymentHistory(args).save(null, {method: 'update'});
      return billPaymentHistory.attributes;
    },

    deleteBillPaymentHistory: (parent, args, { knex }) => knex('bill_payment_history').where(args).del(),

    createLoan: async (parent, args, { models }) => await new models.Loan(args).save(null, {method:'insert'}),
    createLoanPayment: async (parent, args, { models }) => await new models.Loan_Payment(args).save(null, {method: 'insert'}),
    getPasswordRecoveryEmail: (parent, args, { knex, user }) => {
      knex('users').where(args).then((data) => {
        sendgrid.sendEmail(data[0].first_name, data[0].email)
      })
    }
  }
}




