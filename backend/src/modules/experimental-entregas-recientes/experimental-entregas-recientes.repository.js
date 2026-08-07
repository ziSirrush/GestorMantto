'use strict';

const db = require('../../config/db');

async function query_uni(sql, params) {
  return db.query(sql, params);
}

module.exports = { query_uni, query };


async function query(sql, params){
  return query_uni(sql, params);
}
