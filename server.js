
const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const app = express();
app.use(cors());
app.use(express.json());
const uri = process.env.MONGO_URI;


const client = new MongoClient(uri);

async function connectDB() {
  await client.connect();
  const db = client.db("dadsWebsite");
  ordersCollection = db.collection("orders");
  console.log("MongoDB connected");
}

connectDB();
// Connect to MongoDB

// const axios = require('axios');
// const crypto = require('crypto');

// 🔥 temp storage for online payment
let pendingOrders = {};

// let orders = [];
let ordersCollection;

// Save order
app.post('/api/orders', async (req, res) => {
  const order = req.body;
  // orders.push(order);
  await ordersCollection.insertOne(order);
  res.json({ success: true });
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
      redirectUrl: "http://localhost:5500/#payment-success?txn=" + transactionId,
      redirectMode: "REDIRECT",
      callbackUrl: "http://localhost:3001/api/payment-callback",
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
app.post('/api/payment-callback', (req, res) => {
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
      orders.push({
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