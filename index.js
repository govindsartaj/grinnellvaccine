require("dotenv").config();
const express = require("express");
const app = express();
const fetch = require("node-fetch");
const port = process.env.PORT || 80;
const bodyParser = require("body-parser");
const cors = require("cors");
const nodemailer = require("nodemailer");
const nodemailerSendgrid = require("nodemailer-sendgrid");
const mongoose = require("mongoose");
const { request } = require("express");
const jwt = require("jsonwebtoken");
const getLocationsWithinRadius = require("./geoTools").getLocationsWithinRadius;

mongoose.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useFindAndModify: false,
});
const db = mongoose.connection;

let globalAvailableLocations = [];

const recipientSchema = new mongoose.Schema(
  {
    email: String,
    zipcode: Number,
    radius: Number,
  },
  {
    versionKey: false,
  }
);

const Recipient = mongoose.model("Recipient", recipientSchema);

app.use(bodyParser.json());
app.use(cors());
app.get("/", (req, res) => {
  res.send("200/OK");
});

const shouldSend = (a1, a2) => {
  return a1.length > a2.length && JSON.stringify(a1) !== JSON.stringify(a2);
};

const buildEmailBody = (
  availableLocations,
  userEmailToken,
  type,
  recipient
) => {
  return (
    `
    ${
      type === "confirm"
        ? "<p>Thanks for signing up to receive Iowa vaccine appointment availability alerts.</p>"
        : ""
    }
    ${
      recipient.zipcode !== undefined && recipient.radius !== undefined
        ? "<h3>Appointments that are approximately within " +
          recipient.radius +
          " miles from " +
          recipient.zipcode +
          "</h3>"
        : ""
    }
    
    <p>${
      availableLocations.length === 0
        ? "Currently, no appointments are available."
        : "Currently, appointments are available at:"
    }</p>
          <ul>
          ${availableLocations
            .map(
              (location) =>
                "<li>" +
                location.name +
                " " +
                location.provider_brand_name +
                " - " +
                `${
                  location.address !== null
                    ? location.address + ", "
                    : ""
                }` +
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
    `<p><strong>IMPORTANT:</strong> Click <a target="_blank" href="https://www.grinnellvaccine.tech/update/` +
    userEmailToken +
    `">here</a> to ${
      recipient.zipcode !== undefined && recipient.radius !== undefined
        ? "update"
        : "add"
    } your zipcode + distance information. This will allow us to send you emails only when appointments open up in locations that are within a certain distance of your zipcode. ${recipient.zipcode === undefined && recipient.radius === undefined ? "<strong>We will stop sending email alerts to users without a zipcode and max distance at 11:59pm CT on Friday, March 19, 2021.</strong>" : ""}</p>` +
    `<footer>Click <a target="_blank" href="https://www.grinnellvaccine.tech/unsubscribe/` +
    userEmailToken +
    `">here</a> to stop receiving these emails.</footer>`
  );
};

const processResData = (data) => {
  const locations = data.features;
  let available = [];
  for (location of locations) {
    if (location.properties.appointments_available === true) {
      available.push(location);
    }
  }
  return available;
};

const sendEmail = (availableLocations, recipient, type = "update") => {
  console.log(availableLocations, recipient, type);

  const transport = nodemailer.createTransport(
    nodemailerSendgrid({
      apiKey: process.env.API_KEY,
    })
  );

  const email = {
    from: '"Iowa Vaccine Alert" alert@em7027.grinnellvaccine.tech',
    to: recipient.email,
    subject:
      type === "confirm"
        ? "Sign Up Confirmation"
        : "New Appointments Available",
    text:
      type === "confirm"
        ? "Sign Up Confirmation"
        : "New Appointments Available",
    html: buildEmailBody(
      availableLocations,
      jwt.sign({ email: recipient.email }, process.env.JWT_SECRET),
      type,
      recipient
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

const sendEmailToRequestZip = (recipient, emailToken) => {
  const transport = nodemailer.createTransport(
    nodemailerSendgrid({
      apiKey: process.env.API_KEY,
    })
  );

  const email = {
    from: '"Iowa Vaccine Alert" alert@em7027.grinnellvaccine.tech',
    to: recipient.email,
    subject: "Action required: Add zipcode info",
    text: "Important Update",
    html:
      `<p>We now require your zipcode and the maximum distance that you are willing to travel.\n<strong>To continue receiving emails about available vaccines in Iowa, please click <a target="_blank" href="https://www.grinnellvaccine.tech/update/` +
      emailToken +
      `">here</a>, and enter your zipcode + max distance.<strong></p><p><strong>We will stop sending email alerts to users without a zipcode and max distance at 11:59pm CT on Friday, March 19, 2021.</strong></p><p>Thanks!</p><footer>Click <a target="_blank" href="https://www.grinnellvaccine.tech/unsubscribe/` +
      emailToken +
      `">here</a> to stop receiving these emails.</footer>`,
  };

  transport.sendMail(email, function (err, info) {
    if (err) {
      console.log(err);
    } else {
      console.log("Message sent: " + JSON.stringify(info));
    }
  });
};

app.get("/appointments", (req, res) => {
  res.send({ appointments: globalAvailableLocations });
});

app.post("/", async (req, res) => {
  try {
    // Check if email is already in database
    const emailExist = await Recipient.findOne({ email: req.body.email });
    if (emailExist) return res.send({ error: "You're already subscribed." });

    const newRecipient = new Recipient({
      email: req.body.email,
      zipcode: req.body.zipcode,
      radius: req.body.radius,
    });
    const addedRecipient = await newRecipient.save();

    // wait one minute before sending confirmation email
    setTimeout(
      () =>
        sendEmail(
          getLocationsWithinRadius(
            globalAvailableLocations,
            req.body.zipcode.toString(),
            parseInt(req.body.radius)
          ).map((l) => l.properties),
          {
            email: req.body.email,
            zipcode: req.body.zipcode,
            radius: req.body.radius,
          },
          "confirm"
        ),
      60000
    );

    res.send({ success: "You are now subscribed! Thank you!" });
    console.log(req.body.email + " subscribed");
  } catch (err) {
    console.log(err);
  }
});

// add/modify zipcode + range
app.patch("/:emailToken", async (req, res) => {
  try {
    const decoded = jwt.verify(req.params.emailToken, process.env.JWT_SECRET);

    const filter = { email: decoded.email };
    const update = { zipcode: req.body.zipcode, radius: req.body.radius };
    let doc = await Recipient.findOneAndUpdate(filter, update, {
      new: true,
    });
    res.send(doc);
  } catch (err) {
    console.log(err);
  }
});

// get user info
app.get("/:emailToken", async (req, res) => {
  try {
    const decoded = jwt.verify(req.params.emailToken, process.env.JWT_SECRET);
    const user = await Recipient.findOne({ email: decoded.email });
    res.send(user);
  } catch (err) {
    console.log(err);
  }
});

// unsubscribe an email from the list
app.get("/unsubscribe/:emailToken", async (req, res) => {
  try {
    const decoded = jwt.verify(req.params.emailToken, process.env.JWT_SECRET);
    console.log(decoded.email + " unsubscribed");
    const removedEmail = await Recipient.deleteOne({ email: decoded.email });
    res.send({ success: "You are now unsubscribed! Stay safe!" });
  } catch (err) {
    console.log(err);
  }
});

// for testing
function getAllRecipients() {
  Recipient.find(function (err, recipientList) {
    if (err) return console.error(err);
    console.log(recipientList);
  });
}

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);

  const enforceZipTime = 1616216399; // Friday, March 19, 2021 11:59:59 PM CT

  db.once("open", function () {
    console.log("db connected");

    Recipient.find(function (err, recipientList) {
      if (err) return console.error(err);

      for (recipient of recipientList) {
        console.log(recipient.radius);
        if (recipient.zipcode === undefined || recipient.radius === undefined) {
          sendEmailToRequestZip(
            recipient,
            jwt.sign({ email: recipient.email }, process.env.JWT_SECRET)
          );
        }
      }
    });

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
            for (recipient of recipientList) {
              if (
                (recipient.zipcode !== undefined &&
                  recipient.radius !== undefined) ||
                new Date().getTime() < enforceZipTime
              ) {
                const locationsWithinRadius =
                  recipient.zipcode !== undefined &&
                  recipient.radius !== undefined
                    ? getLocationsWithinRadius(
                        globalAvailableLocations,
                        recipient.zipcode.toString(),
                        recipient.radius
                      )
                    : globalAvailableLocations;
                if (locationsWithinRadius.length > 0) {
                  sendEmail(
                    locationsWithinRadius.map((l) => l.properties),
                    recipient
                  );
                }
              }
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
