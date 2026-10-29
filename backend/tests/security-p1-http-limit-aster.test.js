'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {chooseBodyLimit_aster:choose}=require('../src/middleware/body-limit.middleware');
test('auth 64kb',()=>assert.equal(choose({originalUrl:'/api/auth/login'}),'64kb'));
test('sync 12mb',()=>assert.equal(choose({originalUrl:'/api/tickets/sync'}),'12mb'));
test('rest 1mb',()=>assert.equal(choose({originalUrl:'/api/tickets'}),'1mb'));
