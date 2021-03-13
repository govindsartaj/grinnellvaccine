require("dotenv").config();
const express = require("express");
const app = express();
const fetch = require("node-fetch");
const port = process.env.PORT || 80;
const bodyParser = require("body-parser");
const cors = require("cors");
const nodemailer = require("nodemailer");
var nodemailerSendgrid = require("nodemailer-sendgrid");
const mongoose = require("mongoose");
const { request } = require("express");
var jwt = require("jsonwebtoken");

mongoose.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;

let globalAvailableLocations = [];

const recipientSchema = new mongoose.Schema(
  {
    email: String,
  },
  {
    versionKey: false,
  }
);

const Recipient = mongoose.model("Recipient", recipientSchema);

const shouldSend = (a1, a2) => {
  return a1.length > a2.length && JSON.stringify(a1) !== JSON.stringify(a2);
};

const buildEmailBody = (availableLocations, userEmailToken) => {
  return (
    `<p>COVID-19 Vaccination Appointments available at: </p>
          <ul>
          ${availableLocations
            .map(
              (location) =>
                "<li>" +
                location.name +
                " " +
                location.provider_brand_name +
                " - " +
                location.city +
                ", " +
                location.state +
                ' (<a target="_blank" href="' +
                location.url +
                '">Follow Link</a>)' +
                "</li>"
            )
            .join("")}
          </ul> ` +
    `<p>Click <a target="_blank" href="https://grinnellvaccine-server.herokuapp.com/unsubscribe/` +
    userEmailToken +
    `">here</a> to unsubscribe</p>`
  );
};

const processResData = (data) => {
  const locations = data.features;

  let available = [];
  for (location of locations) {
    if (location.properties.appointments_available === true) {
      available.push(location.properties);
    }
  }

  return available;
};

app.use(bodyParser.json());
app.use(cors());
app.get("/", (req, res) => {
  res.send("200/OK");
});

const sendEmail = (availableLocations, recipient) => {
  const transport = nodemailer.createTransport(
    nodemailerSendgrid({
      apiKey: process.env.API_KEY,
    })
  );

  var email = {
    from: '"Iowa Vaccine Alert" alert@em7027.grinnellvaccine.tech',
    to: recipient,
    subject: "New Appointments Available",
    text: "New Appointments Available",
    html: buildEmailBody(
      availableLocations,
      jwt.sign({ email: recipient }, process.env.JWT_SECRET)
    ),
  };

  transport.sendMail(email, function (err, info) {
    if (err) {
      console.log(err);
    } else {
      console.log("Message sent: " + JSON.stringify(info));
    }
  });
};

app.post("/", async (req, res) => {
  try {
    // Check if email is already in database
    const emailExist = await Recipient.findOne({ email: req.body.email });
    if (emailExist) return res.send({ error: "You're already subscribed." });

    const newRecipient = new Recipient({ email: req.body.email });
    const addedRecipient = await newRecipient.save();
    res.send({ success: "You are now subscribed! Thank you!" });
    console.log(req.body.email + ' subscribed');
  } catch (err) {
    console.log(err);
  }
});

// unsubscribe an email from the list
app.get("/unsubscribe/:emailToken", async (req, res) => {
  try {
    var decoded = jwt.verify(req.params.emailToken, process.env.JWT_SECRET);
    console.log(decoded.email + ' unsubscribed');
    const removedEmail = await Recipient.deleteOne({ email: decoded.email });
    res.send("You are now unsubscribed! Stay safe!");
  } catch (err) {
    console.log(err);
  }
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);

  db.once("open", function () {
    console.log("db connected");
    setInterval(async () => {
      try {
        const res = await fetch(
          "https://www.vaccinespotter.org/api/v0/states/IA.json"
        );
        const resJson = await res.json();
        const prevAvailableLocations = globalAvailableLocations;
        globalAvailableLocations = processResData(resJson);
        console.log(globalAvailableLocations);
        if (shouldSend(globalAvailableLocations, prevAvailableLocations)) {
          Recipient.find(function (err, recipientList) {
            if (err) return console.error(err);
            const cleanRecipients = recipientList.map(
              (rawRecipient) => rawRecipient.email
            );
            for (recipient of cleanRecipients) {
              sendEmail(globalAvailableLocations, recipient);
            }
          });
        } else {
          console.log("appointments unchanged/fewer appointments available");
        }
      } catch (e) {
        console.log(e);
      }
    }, 60 * 1000);
  });
});
