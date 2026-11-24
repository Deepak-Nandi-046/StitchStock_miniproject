
require('dotenv').config();

const express = require('express');
const path = require('path');
const supabase = require('./config/supabaseClient');
const db = require('./db');
const orderStore = require('./db/orderStore');
const localProductStore = require('./db/localProductStore');
const { restorePreorders } = require('./engines/e1-preorder');

const app = express();

app.use(express.json({ limit: '20mb' }));
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

app.get('/health', async (req, res) => {
    if (!supabase) {
        return res.json({
            status: 'degraded',
            service: 'stitchstock-backend',
            database: 'disconnected',
            timestamp: new Date().toISOString(),
            databaseError: 'Supabase environment variables are not configured'
        });
    }
    const { data, error } = await supabase
        .from('products')
        .select('id')
        .limit(1);
    res.json({
        status: error ? 'degraded' : 'ok',
        service: 'stitchstock-backend',
        database: error ? 'disconnected' : 'connected',
        timestamp: new Date().toISOString(),
        ...(error ? { databaseError: error.message } : {})
    });
});

// Test Supabase connection
app.get('/api/test-supabase', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .limit(5);

        if (error) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        res.json({
            success: true,
            message: 'Supabase connected successfully!',
            products: data
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Existing API routes
app.use('/api', require('./routes'));

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
});

const port = process.env.PORT || 3000;

if (require.main === module) {
    Promise.all([orderStore.load(), supabase ? Promise.resolve(db.products) : localProductStore.load(db.products)])
        .then(async ([orders, products]) => {
            db.orders.splice(0, db.orders.length, ...orders);
            if (!supabase) db.products.splice(0, db.products.length, ...products);
            restorePreorders(db.orders);
            if (db.orders.length) await orderStore.save(db.orders);
            const server = app.listen(port, () =>
                console.log('StitchStock on http://localhost:' + port)
            );

            server.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    console.log(
                        `StitchStock is already running on http://localhost:${port}. ` +
                        'No additional server process was started.'
                    );
                    process.exit(0);
                }

                console.error('Unable to start StitchStock:', error);
                process.exit(1);
            });
        })
        .catch(error => {
            console.error('Unable to load saved order and product data:', error);
            process.exit(1);
        });
}

module.exports = app;
