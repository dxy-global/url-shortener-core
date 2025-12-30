const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'url_shortener';

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
    host: DB_HOST,
    dialect: 'mysql',
    logging: false
});

const Domain = sequelize.define('Domain', {
    hostname: { type: DataTypes.STRING, allowNull: false, unique: true }
});

const Path = sequelize.define('Path', {
    short_path: { type: DataTypes.STRING, allowNull: false },
    original_url: { type: DataTypes.TEXT, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
    indexes: [{ unique: true, fields: ['DomainId', 'short_path'] }]
});

const AccessLog = sequelize.define('AccessLog', {
    ip_address: DataTypes.STRING,
    user_agent: DataTypes.TEXT,
    country: DataTypes.STRING,
    timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
});

Domain.hasMany(Path);
Path.belongsTo(Domain);
Path.hasMany(AccessLog);
AccessLog.belongsTo(Path);

module.exports = { sequelize, Domain, Path, AccessLog };
