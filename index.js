const express = require('express');
const bodyParser = require('body-parser');
const { sequelize, Domain, Path, AccessLog, ApiKey } = require('./models');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

// Auth Middleware for Internal Endpoints
const authenticateInternal = async (req, res, next) => {
    const token = req.headers['x-api-token'];
    if (!token) return res.status(401).json({ error: 'Missing API token' });

    const apiKey = await ApiKey.findOne({ where: { token } });
    if (!apiKey) return res.status(403).json({ error: 'Invalid API token' });

    next();
};

// Admin: Generate API Token
app.post('/admin/tokens', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const token = crypto.randomBytes(32).toString('hex');
    try {
        const apiKey = await ApiKey.create({ name, token });
        res.status(201).json({ name: apiKey.name, token: apiKey.token });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Add Domain
app.post('/admin/domains', async (req, res) => {
    try {
        const domain = await Domain.create({ hostname: req.body.hostname });
        res.status(201).json(domain);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Add Path
app.post('/admin/paths', async (req, res) => {
    try {
        const path = await Path.create(req.body);
        res.status(201).json(path);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Get Access History
app.get('/admin/history/:path_id', async (req, res) => {
    try {
        const logs = await AccessLog.findAll({
            where: { PathId: req.params.path_id },
            order: [['timestamp', 'DESC']]
        });
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Internal: Sync Paths
app.get('/internal/sync/paths', authenticateInternal, async (req, res) => {
    try {
        const paths = await Path.findAll({
            where: { is_active: true },
            include: [Domain]
        });
        const result = paths.map(p => ({
            short_path: p.short_path,
            original_url: p.original_url,
            hostname: p.Domain.hostname
        }));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Internal: Sync Logs
app.post('/internal/sync/logs', authenticateInternal, async (req, res) => {
    const logs = req.body;
    if (!Array.isArray(logs)) return res.status(400).json({ error: 'Invalid format' });

    const t = await sequelize.transaction();
    try {
        for (const log of logs) {
            const domain = await Domain.findOne({ where: { hostname: log.hostname } }, { transaction: t });
            if (domain) {
                const path = await Path.findOne({ 
                    where: { DomainId: domain.id, short_path: log.short_path } 
                }, { transaction: t });
                
                if (path) {
                    await AccessLog.create({
                        PathId: path.id,
                        ip_address: log.ip_address,
                        user_agent: log.user_agent,
                        country: log.country,
                        timestamp: log.timestamp
                    }, { transaction: t });
                }
            }
        }
        await t.commit();
        res.json({ success: true });
    } catch (err) {
        await t.rollback();
        res.status(500).json({ error: err.message });
    }
});

async function start() {
    console.log('Checking dependencies...');
    try {
        await sequelize.authenticate();
        console.log('✅ Database connection: SUCCESS');
        
        await sequelize.sync({ alter: true });
        console.log('✅ Database schema: SYNCED');

        const PORT = process.env.CORE_PORT || 3000;
        app.listen(PORT, () => {
            console.log(`🚀 Core Service running on port ${PORT}`);
        });
    } catch (err) {
        console.error('❌ Database connection: FAILED');
        console.error(err.message);
        process.exit(1);
    }
}

start();
