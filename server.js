
const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const app = express();
app.use(cors());
app.use(express.json());
const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB_URL || '';


const client = uri ? new MongoClient(uri) : null;

let ordersCollection;
let settingsCollection;

function createMemoryCollection(store) {
  return {
    async findOne(query = {}) {
      return store.find((item) => Object.keys(query).every((key) => item[key] === query[key])) || null;
    },
    async countDocuments() {
      return store.length;
    },
    async insertOne(doc) {
      store.push({ ...doc, _id: Date.now() + Math.random() });
      return { insertedId: store[store.length - 1]._id };
    },
    async deleteMany() {
      store.length = 0;
      return { deletedCount: 0 };
    },
    async updateOne(query, update, options = {}) {
      const index = store.findIndex((item) => Object.keys(query).every((key) => item[key] === query[key]));
      if (index === -1) {
        if (options.upsert) {
          const doc = { ...query, ...update.$set };
          store.push(doc);
          return { upsertedCount: 1 };
        }
        return { matchedCount: 0, modifiedCount: 0 };
      }
      store[index] = { ...store[index], ...(update.$set || {}) };
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async findOneAndUpdate(query, update, options = {}) {
      const index = store.findIndex((item) => Object.keys(query).every((key) => item[key] === query[key]));
      if (index === -1) {
        return { value: null };
      }
      store[index] = { ...store[index], ...(update.$set || {}) };
      return { value: store[index] };
    },
    find() {
      return {
        toArray: async () => store.slice(),
      };
    },
  };
}

async function connectDB() {
  if (!client) {
    ordersCollection = createMemoryCollection([]);
    settingsCollection = createMemoryCollection([]);
    console.log('MongoDB URI not set, using in-memory storage');
    return;
  }

  await client.connect();
  const db = client.db('dadsWebsite');
  ordersCollection = db.collection('orders');
  settingsCollection = db.collection('settings');
  console.log('MongoDB connected');
}

connectDB().catch((err) => console.error('MongoDB connection failed:', err));
// Connect to MongoDB

// const axios = require('axios');
// const crypto = require('crypto');

// 🔥 temp storage for online payment
let pendingOrders = {};

// let orders = [];

// Save order
app.post('/api/orders', async (req, res) => {
  try {
    const order = req.body || {};

    // check order limit (if set)
    const s = await settingsCollection.findOne({ key: 'orderLimit' });
    const limit = s && typeof s.value === 'number' ? s.value : null;
    if (limit !== null) {
      const total = await ordersCollection.countDocuments();
      if (total >= limit) {
        return res.status(400).json({ success: false, error: 'Order limit reached' });
      }
    }

    // capture client IP
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    order.ip = ip;

    // ensure basic fields
    order.status = order.status || 'In Process';
    order.placed = order.placed || new Date().toISOString();

    await ordersCollection.insertOne(order);
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving order:', err);
    res.status(500).json({ success: false, error: 'Save failed' });
  }
});

// Accept an order (admin)
app.post('/api/orders/:id/accept', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await ordersCollection.findOneAndUpdate(
      { id },
      { $set: { status: 'Placed', placed: new Date().toISOString(), progress: 0 } },
      { returnDocument: 'after' }
    );
    res.json({ success: true, order: result.value });
  } catch (err) {
    console.error('Accept error:', err);
    res.status(500).json({ success: false });
  }
});

// Decline/cancel an order (admin)
app.post('/api/orders/:id/decline', async (req, res) => {
  try {
    const id = req.params.id;
    const reason = req.body && req.body.reason ? req.body.reason : 'Declined by admin';
    const result = await ordersCollection.findOneAndUpdate(
      { id },
      { $set: { status: 'Cancelled', cancellationReason: reason, cancelledAt: new Date().toISOString(), progress: 0 } },
      { returnDocument: 'after' }
    );
    res.json({ success: true, order: result.value });
  } catch (err) {
    console.error('Decline error:', err);
    res.status(500).json({ success: false });
  }
});

// Order limit settings
app.get('/api/settings/order-limit', async (req, res) => {
  try {
    const s = await settingsCollection.findOne({ key: 'orderLimit' });
    res.json({ limit: s && typeof s.value === 'number' ? s.value : null });
  } catch (err) {
    console.error('Settings get error:', err);
    res.status(500).json({ error: 'failed' });
  }
});

app.post('/api/settings/order-limit', async (req, res) => {
  try {
    const limit = Number(req.body && req.body.limit);
    if (isNaN(limit)) return res.status(400).json({ success: false });
    await settingsCollection.updateOne({ key: 'orderLimit' }, { $set: { value: limit } }, { upsert: true });
    res.json({ success: true, limit });
  } catch (err) {
    console.error('Settings set error:', err);
    res.status(500).json({ success: false });
  }
});

// Get orders
app.get('/api/orders',  async (req, res) => {
  const orders = await ordersCollection.find().toArray();
res.json(orders);
});

// Delete orders
app.delete('/api/orders', async (req, res) => {
  // orders = [];
  await ordersCollection.deleteMany({});
  res.json({ success: true });
});
// app.get('/api/orders', async (req, res) => {
//   const orders = await ordersCollection.find().toArray();
//   res.json(orders);
// });
app.get('/api/buys', async (req, res) => {
  try {
    const orders = await ordersCollection.find().toArray();
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch buys" });
  }
});
// app.post('/api/pay', async (req, res) => {
//   const { amount, orderData } = req.body;

//   const merchantTransactionId = "TXN" + Date.now();

//   // store order temporarily
//   pendingOrders[merchantTransactionId] = orderData;

//   const data = {
//     merchantId: "YOUR_MERCHANT_ID",
//     merchantTransactionId,
//     merchantUserId: "USER1",
//     amount: amount * 100,
//     redirectUrl: "http://localhost:5500/success.html",
//     redirectMode: "REDIRECT",
//     callbackUrl: "http://localhost:3001/api/status",
//     paymentInstrument: {
//       type: "PAY_PAGE"
//     }
//   };

//   const payload = Buffer.from(JSON.stringify(data)).toString('base64');

//   const checksum =
//     crypto.createHash('sha256')
//       .update(payload + "/pg/v1/pay" + "YOUR_SALT_KEY")
//       .digest('hex') + "###1";

//   try {
//     const response = await axios.post(
//       "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay",
//       { request: payload },
//       {
//         headers: {
//           "Content-Type": "application/json",
//           "X-VERIFY": checksum
//         }
//       }
//     );

//     res.json(response.data);

//   } catch (err) {
//     console.error(err);
//     res.status(500).send("Payment error");
//   }
// });
// app.post('/api/status', (req, res) => {
//   const txnId = req.body.merchantTransactionId;

//   const order = pendingOrders[txnId];

//   if(order){
//     console.log("✅ Payment success, saving order:", order);

//     // ✅ SAVE ORDER HERE (same as COD)
//     orders.push(order);

//     delete pendingOrders[txnId];
//   }

//   res.sendStatus(200);
// });

   const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const MERCHANT_ID = "YOUR_MERCHANT_ID";
const SALT_KEY = "YOUR_SALT_KEY";
const SALT_INDEX = 1;

// app.post('/api/pay', async (req, res) => {
//   try {
//     const { amount, orderData } = req.body;

//     const transactionId = "TXN_" + Date.now();

//     const payload = {
//       merchantId: MERCHANT_ID,
//       merchantTransactionId: transactionId,
//       merchantUserId: "USER_" + Date.now(),
//       amount: amount * 100, // paise
//       redirectUrl: "http://localhost:5500/#payment-success",
//       redirectMode: "REDIRECT",
//       callbackUrl: "http://localhost:3001/api/payment-callback",
//       paymentInstrument: {
//         type: "PAY_PAGE"
//       }
//     };

//     const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');

//     const stringToHash = base64Payload + "/pg/v1/pay" + SALT_KEY;
//     const sha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
//     const checksum = sha256 + "###" + SALT_INDEX;

//     const response = await axios.post(
//       "https://api.phonepe.com/apis/hermes/pg/v1/pay",
//       { request: base64Payload },
//       {
//         headers: {
//           "Content-Type": "application/json",
//           "X-VERIFY": checksum
//         }
//       }
//     );

//     res.json(response.data);

//   } catch (err) {
//     console.error("Payment Error:", err.response?.data || err.message);

//     res.status(500).json({
//       success: false,
//       message: "Payment failed"
//     });
//   }
// });
// app.post('/api/payment-callback', (req, res) => {
//   console.log("Payment callback:", req.body);

//   // TODO: verify payment status

//   res.send("OK");
// });
app.post('/api/pay', async (req, res) => {
  try {
    const { amount, orderData } = req.body;

    const transactionId = "TXN_" + Date.now();

    // ✅ STORE ORDER TEMPORARILY
    pendingOrders[transactionId] = orderData;

    const payload = {
      merchantId: MERCHANT_ID,
      merchantTransactionId: transactionId,
      merchantUserId: "USER_" + Date.now(),
      amount: amount * 100,
      // redirectUrl: "http://localhost:5500/#payment-success?txn=" + transactionId,
     redirectUrl: "https://your-frontend-url/#payment-success?txn=" + transactionId,
      redirectMode: "REDIRECT",
      // callbackUrl: "http://localhost:3001/api/payment-callback",
      callbackUrl: "https://dads-backend.onrender.com/api/payment-callback",
      paymentInstrument: { type: "PAY_PAGE" }
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');

    const stringToHash = base64Payload + "/pg/v1/pay" + SALT_KEY;
    const sha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
    const checksum = sha256 + "###" + SALT_INDEX;

    const response = await axios.post(
      "https://api-preprod.phonepe.com/apis/hermes/pg/v1/pay",
      { request: base64Payload },
      {
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": checksum
        }
      }
    );

    res.json(response.data);

  } catch (err) {
    console.error("Payment Error:", err);
    res.status(500).json({ success: false });
  }
});
app.post('/api/payment-callback', async (req, res) => {
  try {
    const data = req.body;

    console.log("Callback:", data);

    const txnId = data?.data?.merchantTransactionId;

    if (!txnId || !pendingOrders[txnId]) {
      return res.status(400).send("Invalid transaction");
    }

    // ✅ PAYMENT SUCCESS CHECK (simplified)
    const success = data?.data?.state === "COMPLETED";

    if (success) {
      const order = pendingOrders[txnId];

      // ✅ SAVE TO REAL ORDERS
      // orders.push({
      //   ...order,
      //   status: "Placed",
      //   pay: "PhonePe",
      //   paid: true,
      //   txnId
      // });
      await ordersCollection.insertOne({
  ...order,
  status: "Placed",
  pay: "PhonePe",
  paid: true,
  txnId
});

      delete pendingOrders[txnId];

      console.log("✅ Order saved after payment");
    }

    res.send("OK");

  } catch (err) {
    console.error("Callback error:", err);
    res.status(500).send("Error");
  }
});
app.listen(3001, () => {
  console.log('Server running on http://localhost:3001');
});