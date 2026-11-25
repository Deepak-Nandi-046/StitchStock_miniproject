require('dotenv').config();

const express = require('express');
const path = require('path');
const db = require('./db/pool');
const { restoreQueuesFromDb } = require('./engines/e1-preorder/restore');

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
    let error = null;
    try { await db.query('select 1 from product limit 1'); } catch (e) { error = e; }
    res.json({
        status: error ? 'degraded' : 'ok',
        service: 'stitchstock-backend',
        database: error ? 'disconnected' : 'connected',
        timestamp: new Date().toISOString(),
        ...(error ? { databaseError: error.message } : {})
    });
});

// API routes
app.use('/api', require('./routes'));

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err);
    const status = Number(err.status) >= 400 && Number(err.status) < 600 ? Number(err.status) : 500;
    res.status(status).json({ error: status < 500 ? err.message : (err.message || 'Server error') });
});

const port = process.env.PORT || 3000;

if (require.main === module) {
    if (!db.isConfigured()) {
        console.error('DATABASE_URL is missing in backend/.env (Supabase > Connect > Session pooler).');
        process.exit(1);
    }
    db.query('select 1')
        .then(() => restoreQueuesFromDb())
        .then(count => {
            console.log(`Database connected. Restored ${count} waiting pre-order(s) into the E1 queue.`);
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
            console.error('Unable to connect to the database:', error.message);
            process.exit(1);
        });
}

module.exports = app;
