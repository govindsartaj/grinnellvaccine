require("dotenv").config();
const express = require("express");
const app = express();
const fetch = require("node-fetch");
const port = 3000;
const nodemailer = require("nodemailer");
var nodemailerSendgrid = require("nodemailer-sendgrid");
const mongoose = require("mongoose");
mongoose.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;

let globalAvailableLocations = [];

const recipientSchema = new mongoose.Schema({
  email: String,
});

const Recipient = mongoose.model("Recipient", recipientSchema);

const shouldSend = (a1, a2) => {
  return a1.length > a2.length && JSON.stringify(a1) !== JSON.stringify(a2);
};

const buildEmailBody = (availableLocations) => {
  return `<p>COVID-19 Vaccination Appointments available at: </p>
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
          </ul>
          `;
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

app.get("/", (req, res) => {
  res.send("200/OK");
});

const sendEmail = (availableLocations, recipient) => {
  console.log(process.env.API_KEY);
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
    html: buildEmailBody(availableLocations),
  };

  transport.sendMail(email, function (err, info) {
    if (err) {
      console.log(err);
    } else {
      console.log("Message sent: " + JSON.stringify(info));
    }
  });
};

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
