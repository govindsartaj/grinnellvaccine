
With the expanded eligibility of COVID vaccines in Iowa, many still find it hard to secure an appointment at both county public health outlets and pharmacies across the state.
However, tools such as [vaccinespotter.org](https://vaccinespotter.org) have made it possible for those eligible to find up-to-date information on state-wide vaccines availability.
Specifically, [vaccinespotter.org](https://vaccinespotter.org) checks and reports available appointments across Iowa every minute while also making that information available through a
beta version of its API - which currently is a collection of JSON files hosted on the website that gets updated every minute.

With the API, we use SendGrid to send emails to users who have signed up for [our service](https://www.grinnellvaccine.tech) when new appointments become available.
We also ask for users' zip code and the maximum distance they can travel to receive the vaccine to only alert them of nearby available appointments. 


*This repo contains code for the back end of our service. Find the front end code [here!](https://github.com/charunupara/GrinnellVaccineFrontEnd)*
