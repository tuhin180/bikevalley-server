const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const app = express();
const port = process.env.PORT || 8000;

// middlewares
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Server is running...");
});

const uri = process.env.DB_URL;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

// verify jwt
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send("unauthorized Access");
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    // collection
    const bikesCategoryCollection = client
      .db("bike-valley")
      .collection("bikeCategory");

    const bikesCollection = client.db("bike-valley").collection("bikes");

    const usersCollection = client.db("bike-valley").collection("users");

    const bookingCollection = client.db("bike-valley").collection("booking");

    const paymentsCollection = client.db("bike-valley").collection("payments");

    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, {
          expiresIn: "1d",
        });
        return res.send({ accessToken: token });
      }
      res.status(403).send({ accessToken: "" });
    });
    // save user
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    //get all user
    app.get("/users", async (req, res) => {
      const query = {};
      const user = await usersCollection.find(query).toArray();
      res.send(user);
    });

    app.get("/users/allseller", async (req, res) => {
      const query = { role: "Seller" };
      const seller = await usersCollection.find(query).toArray();
      res.send(seller);
    });

    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send({ isAdmin: user?.role === "admin" });
    });

    app.get("/users/seller/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send({ isSeller: user?.role === "Seller" });
    });
    app.get("/users/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send({ isUser: user?.role === "user" });
    });

    app.get("/categories", async (req, res) => {
      const query = {};
      const result = await bikesCategoryCollection
        .find(query)
        .limit(3)
        .toArray();
      res.send(result);
    });

    app.get("/category/:id", async (req, res) => {
      const id = req.params.id;
      const query = { category_id: id };
      const options = await bikesCollection.find(query).toArray();
      res.send(options);
    });

    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const query = {
        email: booking.email,
        productName: booking.productName,
      };
      const alreadyBooked = await bookingCollection.find(query).toArray();
      if (alreadyBooked.length) {
        const message = `you have already booked this item before`;
        return res.send({ acknowledge: false, message });
      }
      const options = await bookingCollection.insertOne(booking);
      res.send(options);
    });

    app.get("/booking", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      //   console.log(decodedEmail);
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const booking = await bookingCollection.find(query).toArray();
      res.send(booking);
    });

    app.get("/booking/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const booking = await bookingCollection.findOne(query);
      res.send(booking);
    });

    app.post("/create-payment-intent", async (req, res) => {
      const booking = req.body;
      const price = booking.price;
      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const result = await paymentsCollection.insertOne(payment);
      const id = payment.bookingId;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const updatedResult = await bookingCollection.updateOne(
        filter,
        updatedDoc
      );
      res.send(result);
    });
  } finally {
  }
}
run().catch((err) => console.error(err));

app.listen(port, () => {
  console.log(`Server is running...on ${port}`);
});
