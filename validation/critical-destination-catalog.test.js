'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');


const BASE_EVENTS = [
  'FALLA_EQUIPO_CRITICO',
  'NUEVO_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA'
];
