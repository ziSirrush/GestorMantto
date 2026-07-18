const db = require('../../config/db');

async function query(sql, params) {
  return db.query(sql, params);
}

module.exports = {
  query
};
