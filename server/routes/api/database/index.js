const express = require('express');
const connectionRoutes = require('./connection');
const schemaRoutes = require('./schema');
const dataRoutes = require('./data');

const router = express.Router();

router.use('/', connectionRoutes);
router.use('/', schemaRoutes);
router.use('/', dataRoutes);

module.exports = router;
