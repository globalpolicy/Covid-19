let chart = null;
let chartState = [];//stores visibility of graphs
let firstRun = true;

let fetchedData;
let todaysData, yesterdaysData;
let N = Number(document.getElementById("N").value);
let delT = 0.1;
let alpha, beta;

attachEventHandlers();

fetchLatestData(finishedFetchingData);

function attachEventHandlers() {
    let inputs = document.getElementsByClassName("inputs");
    for (let i = 0; i < inputs.length; i++) {
        inputs[i].addEventListener("change", inputsChangedEventHandler);
    }

    function inputsChangedEventHandler(event) {
        showBanner("Fetching data...");
        fetchLatestData(finishedFetchingData);
        //save current state of the graphs' visibility
        chartState = [];
        for (let i = 0; i < chart.data.datasets.length; i++) {
            chartState.push(chart.getDatasetMeta(i).hidden);
        }
    }
}

function showBanner(text) {
    document.getElementById("overlay").style.display = "block";
    document.getElementById("overlayText").innerHTML = text;
}

function hideBanner() {
    document.getElementById("overlay").style.display = "none";
}

function toggleTableVisibility() {
    if (document.getElementById("chkShowTable").checked) {
        document.getElementById("dataTableHolder").style.display = "block";
    } else {
        document.getElementById("dataTableHolder").style.display = "none";

    }
}

function fetchLatestData(finishedFetchingData) {
    let xhr = new XMLHttpRequest();

    xhr.addEventListener("readystatechange", function () {
        if (this.readyState === this.DONE) {
            let JSONResponse = JSON.parse(this.response);
            let selectedCountry = getSelectedCountry();
            let countries = Object.keys(JSONResponse);
            if (firstRun)
                populateCountryList(countries);

            let timeSeries = [];
            let days = JSONResponse[countries[0]].length;
            fillPopulationNumber(selectedCountry);
            N = Number(document.getElementById("N").value);

            if (selectedCountry == "all") {

                for (let i = 0; i < days; i++) {
                    let globalConfirmed = 0, globalDeaths = 0, globalRecovered = 0, date;

                    for (let j = 0; j < countries.length; j++) {
                        let countryData = JSONResponse[countries[j]][i];
                        date = countryData.date;
                        globalConfirmed += countryData.confirmed;
                        globalDeaths += countryData.deaths;
                        globalRecovered += countryData.recovered;
                    }

                    timeSeries.push({
                        date: date,
                        confirmed: globalConfirmed,
                        deaths: globalDeaths,
                        recovered: globalRecovered,
                        infective_: globalConfirmed - globalDeaths - globalRecovered,
                        susceptible_: N - globalConfirmed,
                        removed_: globalRecovered + globalDeaths
                    });

                }
            } else {
                let countryData = JSONResponse[selectedCountry];
                for (let i = 0; i < days; i++) {
                    timeSeries.push({
                        date: countryData[i].date,
                        confirmed: countryData[i].confirmed,
                        deaths: countryData[i].deaths,
                        recovered: countryData[i].recovered,
                        infective_: countryData[i].confirmed - countryData[i].deaths - countryData[i].recovered,
                        susceptible_: N - countryData[i].confirmed,
                        removed_: countryData[i].recovered + countryData[i].deaths
                    });
                }
            }

            fetchedData = filterFromFirstCase(timeSeries);//only keep data from the first case
            finishedFetchingData();
        }
    });

    xhr.open("GET", "https://pomber.github.io/covid19/timeseries.json");
    xhr.send();


}

function finishedFetchingData() {
    let mean_alpha = 0, mean_beta = 0;


    for (let i = 1; i < fetchedData.length; i++) {//start from second

        let todayActiveCases = fetchedData[i].infective_;
        let yesterdayActiveCases = fetchedData[i - 1].infective_;

        let susceptibleToday = fetchedData[i].susceptible_;
        let susceptibleYesterday = fetchedData[i - 1].susceptible_;

        let delS = susceptibleToday - susceptibleYesterday;
        let I = 0.5 * (todayActiveCases + yesterdayActiveCases);
        let S = 0.5 * (susceptibleToday + susceptibleToday);
        beta = Math.abs(delS) / (I * S / N);

        let cumulativeRemovedToday = fetchedData[i].removed_;
        let cumulativeRemovedYesterday = fetchedData[i - 1].removed_;
        let delR = cumulativeRemovedToday - cumulativeRemovedYesterday;
        alpha = delR / I;

        alpha = Number.isFinite(alpha) ? alpha : 0;
        beta = Number.isFinite(beta) ? beta : 0;

        fetchedData[i].beta = beta;
        fetchedData[i].alpha = alpha;

        if (alpha == 0)
            fetchedData[i].R0 = "-";
        else
            fetchedData[i].R0 = (beta / alpha).toFixed(3);


        mean_alpha += alpha;
        mean_beta += beta;
    }
    mean_alpha /= (fetchedData.length - 1);
    mean_beta /= (fetchedData.length - 1);

    if (document.getElementById("opt_latest").checked) {
        //do nothing. default behavior
    }
    else if (document.getElementById("opt_last5").checked) {
        alpha = fetchedData.slice(fetchedData.length - 5).reduce((ret, element) => ret + element.alpha, 0) / 5;
        beta = fetchedData.slice(fetchedData.length - 5).reduce((ret, element) => ret + element.beta, 0) / 5;
    }
    else if (document.getElementById("opt_last14").checked) {
        alpha = fetchedData.slice(fetchedData.length - 14).reduce((ret, element) => ret + element.alpha, 0) / 14;
        beta = fetchedData.slice(fetchedData.length - 14).reduce((ret, element) => ret + element.beta, 0) / 14;
    }
    else if (document.getElementById("opt_mean").checked) {
        alpha = mean_alpha;
        beta = mean_beta;
    }

    document.getElementById("betaText").innerHTML = beta.toFixed(4);
    document.getElementById("alphaText").innerHTML = alpha.toFixed(4);
    document.getElementById("R0Text").innerHTML = (beta / alpha).toFixed(3);
    document.getElementById("I0Text").innerHTML = fetchedData[0].infective_ + "     @      " + fetchedData[0].date;
    showTable();
    computeAndGraph((beta / alpha).toFixed(3));
}

function showTable() {
    let dataTable = new Tabulator("#dataTableHolder", {
        data: fetchedData,
        layout: "fitDataStretch",
        columns: [
            {
                title: "Date", field: "date",
                sorter: function (a, b, aRow, bRow, column, dir, sorterParams) {
                    let dateA = new Date(a);
                    let dateB = new Date(b);
                    return dateA - dateB; //you must return the difference between the two values
                }
            },
            { title: "Total Cases", field: "confirmed", headerTooltip: "Population that has hitherto been affected, includes the currently infected, total recovered and dead" },
            { title: "Deaths", field: "deaths", headerTooltip: "Total deaths till date" },
            { title: "Recovered", field: "recovered", headerTooltip: "Total recoveries till date" },
            { title: "Infectives", field: "infective_", headerTooltip: "Currently infected population" },
            { title: "Removed", field: "removed_", headerTooltip: "Total recovered plus dead population" },
            { title: "Susceptible", field: "susceptible_", headerTooltip: "Population not yet affected in any way" },
            { title: "β", field: "beta", formatter: roundOff, headerTooltip: "Transmission constant" },
            { title: "α", field: "alpha", formatter: roundOff, headerTooltip: "Recovery constant" },
            { title: "R0", field: "R0", formatter: roundOff, headerTooltip: "Basic Reproduction Number" }
        ]
    });

    function roundOff(cell, formatterParams, onRendered) {
        if (cell.getValue() == null || cell.getValue()=="-") {
            return "-";
        } else {
            return Number(cell.getValue()).toFixed(4);
        }
    }

}


function computeAndGraph(R0) {
    showBanner("Computing...");

    let maxTime = Number(document.getElementById("maxTime").value);


    let I_ar = [];
    let S_ar = [];
    let R_ar = [];
    let t_ar = [];
    let I_plus_R_ar = [];
    let realI_ar = [];
    let realS_ar = [];
    let realR_ar = [];
    let realI_plus_R_ar = [];

    let I = fetchedData[0].infective_;
    let S = N;
    let R = 0;

    let counter = 0;

    for (let t = 0; t <= maxTime; t += delT) {
        let delS = -beta * S * I / N * delT;
        let delI = beta * S * I / N * delT - alpha * I * delT;
        let delR = alpha * I * delT;
        S += delS;
        I += delI;
        R += delR;

        let t_rounded = Number(t.toFixed(2));
        if (Number.isInteger(t_rounded)) {
            //only plot daily data
            I_ar.push(I);
            S_ar.push(S);
            R_ar.push(R);
            t_ar.push(t_rounded);
            I_plus_R_ar.push(I + R);

            if (t_rounded < fetchedData.length) {//push recorded data
                realI_ar.push(fetchedData[t_rounded].infective_);
                realS_ar.push(fetchedData[t_rounded].susceptible_);
                realR_ar.push(fetchedData[t_rounded].removed_);
                realI_plus_R_ar.push(fetchedData[t_rounded].confirmed);
            }
        }

    }

    hideBanner();


    drawChart({
        t: t_ar,
        I: I_ar,
        S: S_ar,
        R: R_ar,
        IplusR: I_plus_R_ar,
        realI: realI_ar,
        realS: realS_ar,
        realR: realR_ar,
        realIplusR: realI_plus_R_ar
    }, N, R0);

}


function drawChart(output, y0, R0) {
    var ctx = document.getElementById('chart').getContext('2d');
    if (chart != undefined) {
        chart.destroy();
    }
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: output.t,
            datasets: [{
                label: 'Est. Infected',
                data: output.I,
                borderColor: ['rgba(255, 99, 132, 1)'],
                borderWidth: 1,
                fill: false,
                pointRadius: 1
            },
            {
                label: 'Est. Susceptible',
                data: output.S,
                borderColor: ['rgba(99, 255, 132, 1)'],
                borderWidth: 1,
                fill: false,
                pointRadius: 1
            },
            {
                label: 'Est. Recovered',
                data: output.R,
                borderColor: ['rgba(99, 132, 255, 1)'],
                borderWidth: 1,
                fill: false,
                pointRadius: 1
            },
            {
                label: 'Est. Cumulative infected',
                data: output.IplusR,
                borderColor: ['rgba(150, 132, 55, 1)'],
                borderWidth: 1,
                fill: false,
                pointRadius: 1
            },
            {
                label: 'Obs. Infected',
                data: output.realI,
                borderColor: ['rgba(205, 49, 82, 1)'],
                borderWidth: 2,
                fill: false,
                pointRadius: 1
            },
            {
                label: 'Obs. Susceptible',
                data: output.realS,
                borderColor: ['rgba(49, 205, 82, 1)'],
                borderWidth: 2,
                fill: false,
                pointRadius: 1
            },
            {
                label: 'Obs. Recovered',
                data: output.realR,
                borderColor: ['rgba(49, 82, 205, 1)'],
                borderWidth: 2,
                fill: false,
                pointRadius: 1
            },
            {
                label: 'Obs. Cumulative infected',
                data: output.realIplusR,
                borderColor: ['rgba(100, 82, 5, 1)'],
                borderWidth: 2,
                fill: false,
                pointRadius: 1
            }
            ]
        },
        options: {
            animation: {
                duration: 1
            },
            scales: {
                yAxes: [{
                    ticks: {
                        beginAtZero: true
                    },
                    scaleLabel: {
                        display: true,
                        labelString: 'Population'
                    }
                }],
                xAxes: [{
                    ticks: {
                        autoSkip: true,
                        maxTicksLimit: 30
                    },
                    scaleLabel: {
                        display: true,
                        labelString: 'Time (days)'
                    }

                }]
            },
            title: {
                display: true,
                text: "Covid-19 over time | R0 = " + R0
            },
            maintainAspectRatio: false,
            responsive: false
        }
    });

    //restore saved graphs' visibility states
    if (chartState.length > 0) {
        for (let i = 0; i < chart.data.datasets.length; i++) {
            chart.getDatasetMeta(i).hidden = chartState[i];
        }
    }
    chart.update();
}

function populateCountryList(countries) {
    firstRun = false;
    document.getElementById("sel_countries").innerHTML = `
    <option value="all">Global</option>
    `;
    for (let i = 0; i < countries.length; i++) {
        document.getElementById("sel_countries").innerHTML += `
        <option value='${countries[i]}'>${countries[i]}</option>
        `;
    }
}

function getSelectedCountry() {
    let selection = document.getElementById("sel_countries").value;
    return selection;
}

function fillPopulationNumber(selectedCountry) {
    let dict = [
        {
            "country": "Afghanistan",
            "population": "35530081"
        },
        {
            "country": "Albania",
            "population": "2930187"
        },
        {
            "country": "Algeria",
            "population": "41318142"
        },
        {
            "country": "American Samoa",
            "population": "55641"
        },
        {
            "country": "Andorra",
            "population": "76965"
        },
        {
            "country": "Angola",
            "population": "29784193"
        },
        {
            "country": "Anguilla",
            "population": "14909"
        },
        {
            "country": "Antarctica",
            "population": null
        },
        {
            "country": "Antigua and Barbuda",
            "population": "102012"
        },
        {
            "country": "Argentina",
            "population": "44271041"
        },
        {
            "country": "Armenia",
            "population": "2930450"
        },
        {
            "country": "Aruba",
            "population": "105264"
        },
        {
            "country": "Australia",
            "population": "24450561"
        },
        {
            "country": "Austria",
            "population": "8735453"
        },
        {
            "country": "Azerbaijan",
            "population": "9827589"
        },
        {
            "country": "Bahamas",
            "population": "395361"
        },
        {
            "country": "Bahrain",
            "population": "1492584"
        },
        {
            "country": "Bangladesh",
            "population": "164669751"
        },
        {
            "country": "Barbados",
            "population": "285719"
        },
        {
            "country": "Belarus",
            "population": "9468338"
        },
        {
            "country": "Belgium",
            "population": "11429336"
        },
        {
            "country": "Belize",
            "population": "374681"
        },
        {
            "country": "Benin",
            "population": "11175692"
        },
        {
            "country": "Bermuda",
            "population": "61349"
        },
        {
            "country": "Bhutan",
            "population": "807610"
        },
        {
            "country": "Bolivia",
            "population": "11051600"
        },
        {
            "country": "Bosnia and Herzegovina",
            "population": "3507017"
        },
        {
            "country": "Botswana",
            "population": "2291661"
        },
        {
            "country": "Bouvet Island",
            "population": null
        },
        {
            "country": "Brazil",
            "population": "209288278"
        },
        {
            "country": "British Indian Ocean Territory",
            "population": null
        },
        {
            "country": "Brunei",
            "population": "428697"
        },
        {
            "country": "Bulgaria",
            "population": "7084571"
        },
        {
            "country": "Burkina Faso",
            "population": "19193382"
        },
        {
            "country": "Burundi",
            "population": "10864245"
        },
        {
            "country": "Cambodia",
            "population": "16005373"
        },
        {
            "country": "Cameroon",
            "population": "24053727"
        },
        {
            "country": "Canada",
            "population": "36624199"
        },
        {
            "country": "Cape Verde",
            "population": "546388"
        },
        {
            "country": "Cayman Islands",
            "population": "61559"
        },
        {
            "country": "Central African Republic",
            "population": "4659080"
        },
        {
            "country": "Chad",
            "population": "14899994"
        },
        {
            "country": "Chile",
            "population": "18054726"
        },
        {
            "country": "China",
            "population": "1409517397"
        },
        {
            "country": "Christmas Island",
            "population": "2500"
        },
        {
            "country": "Cocos (Keeling) Islands",
            "population": "600"
        },
        {
            "country": "Colombia",
            "population": "49065615"
        },
        {
            "country": "Comoros",
            "population": "813912"
        },
        {
            "country": "Congo",
            "population": "5260750"
        },
        {
            "country": "Cook Islands",
            "population": "17380"
        },
        {
            "country": "Costa Rica",
            "population": "4905769"
        },
        {
            "country": "Croatia",
            "population": "4189353"
        },
        {
            "country": "Cuba",
            "population": "11484636"
        },
        {
            "country": "Cyprus",
            "population": "1179551"
        },
        {
            "country": "Czech Republic",
            "population": "10618303"
        },
        {
            "country": "Denmark",
            "population": "5733551"
        },
        {
            "country": "Djibouti",
            "population": "956985"
        },
        {
            "country": "Dominica",
            "population": "73925"
        },
        {
            "country": "Dominican Republic",
            "population": "10766998"
        },
        {
            "country": "East Timor",
            "population": "1296311"
        },
        {
            "country": "Ecuador",
            "population": "16624858"
        },
        {
            "country": "Egypt",
            "population": "97553151"
        },
        {
            "country": "El Salvador",
            "population": "6377853"
        },
        {
            "country": "England",
            "population": null
        },
        {
            "country": "Equatorial Guinea",
            "population": "1267689"
        },
        {
            "country": "Eritrea",
            "population": "5068831"
        },
        {
            "country": "Estonia",
            "population": "1309632"
        },
        {
            "country": "Ethiopia",
            "population": "104957438"
        },
        {
            "country": "Falkland Islands",
            "population": "2910"
        },
        {
            "country": "Faroe Islands",
            "population": "49290"
        },
        {
            "country": "Fiji Islands",
            "population": "905502"
        },
        {
            "country": "Finland",
            "population": "5523231"
        },
        {
            "country": "France",
            "population": "64979548"
        },
        {
            "country": "French Guiana",
            "population": "282731"
        },
        {
            "country": "French Polynesia",
            "population": "283007"
        },
        {
            "country": "French Southern territories",
            "population": null
        },
        {
            "country": "Gabon",
            "population": "2025137"
        },
        {
            "country": "Gambia",
            "population": "2100568"
        },
        {
            "country": "Georgia",
            "population": "3912061"
        },
        {
            "country": "Germany",
            "population": "82114224"
        },
        {
            "country": "Ghana",
            "population": "28833629"
        },
        {
            "country": "Gibraltar",
            "population": "34571"
        },
        {
            "country": "Greece",
            "population": "11159773"
        },
        {
            "country": "Greenland",
            "population": "56480"
        },
        {
            "country": "Grenada",
            "population": "107825"
        },
        {
            "country": "Guadeloupe",
            "population": "449568"
        },
        {
            "country": "Guam",
            "population": "164229"
        },
        {
            "country": "Guatemala",
            "population": "16913503"
        },
        {
            "country": "Guinea",
            "population": "12717176"
        },
        {
            "country": "Guinea-Bissau",
            "population": "1861283"
        },
        {
            "country": "Guyana",
            "population": "777859"
        },
        {
            "country": "Haiti",
            "population": "10981229"
        },
        {
            "country": "Heard Island and McDonald Islands",
            "population": null
        },
        {
            "country": "Holy See (Vatican City State)",
            "population": "1000"
        },
        {
            "country": "Honduras",
            "population": "9265067"
        },
        {
            "country": "Hong Kong",
            "population": "7364883"
        },
        {
            "country": "Hungary",
            "population": "9721559"
        },
        {
            "country": "Iceland",
            "population": "335025"
        },
        {
            "country": "India",
            "population": "1339180127"
        },
        {
            "country": "Indonesia",
            "population": "263991379"
        },
        {
            "country": "Iran",
            "population": "81162788"
        },
        {
            "country": "Iraq",
            "population": "38274618"
        },
        {
            "country": "Ireland",
            "population": "4761657"
        },
        {
            "country": "Israel",
            "population": "8321570"
        },
        {
            "country": "Italy",
            "population": "59359900"
        },
        {
            "country": "Ivory Coast",
            "population": "24294750"
        },
        {
            "country": "Jamaica",
            "population": "2890299"
        },
        {
            "country": "Japan",
            "population": "127484450"
        },
        {
            "country": "Jordan",
            "population": "9702353"
        },
        {
            "country": "Kazakhstan",
            "population": "18204499"
        },
        {
            "country": "Kenya",
            "population": "49699862"
        },
        {
            "country": "Kiribati",
            "population": "116398"
        },
        {
            "country": "Kuwait",
            "population": "4136528"
        },
        {
            "country": "Kyrgyzstan",
            "population": "6045117"
        },
        {
            "country": "Laos",
            "population": "6858160"
        },
        {
            "country": "Latvia",
            "population": "1949670"
        },
        {
            "country": "Lebanon",
            "population": "6082357"
        },
        {
            "country": "Lesotho",
            "population": "2233339"
        },
        {
            "country": "Liberia",
            "population": "4731906"
        },
        {
            "country": "Libyan Arab Jamahiriya",
            "population": "5605000"
        },
        {
            "country": "Liechtenstein",
            "population": "37922"
        },
        {
            "country": "Lithuania",
            "population": "2890297"
        },
        {
            "country": "Luxembourg",
            "population": "583455"
        },
        {
            "country": "Macao",
            "population": "473000"
        },
        {
            "country": "North Macedonia",
            "population": "2024000"
        },
        {
            "country": "Madagascar",
            "population": "25570895"
        },
        {
            "country": "Malawi",
            "population": "18622104"
        },
        {
            "country": "Malaysia",
            "population": "31624264"
        },
        {
            "country": "Maldives",
            "population": "436330"
        },
        {
            "country": "Mali",
            "population": "18541980"
        },
        {
            "country": "Malta",
            "population": "430835"
        },
        {
            "country": "Marshall Islands",
            "population": "53127"
        },
        {
            "country": "Martinique",
            "population": "384896"
        },
        {
            "country": "Mauritania",
            "population": "4420184"
        },
        {
            "country": "Mauritius",
            "population": "1265138"
        },
        {
            "country": "Mayotte",
            "population": "253045"
        },
        {
            "country": "Mexico",
            "population": "129163276"
        },
        {
            "country": "Micronesia, Federated States of",
            "population": null
        },
        {
            "country": "Moldova",
            "population": "4051212"
        },
        {
            "country": "Monaco",
            "population": "38695"
        },
        {
            "country": "Mongolia",
            "population": "3075647"
        },
        {
            "country": "Montserrat",
            "population": "5177"
        },
        {
            "country": "Morocco",
            "population": "35739580"
        },
        {
            "country": "Mozambique",
            "population": "29668834"
        },
        {
            "country": "Burma",
            "population": "53370609"
        },
        {
            "country": "Namibia",
            "population": "2533794"
        },
        {
            "country": "Nauru",
            "population": "11359"
        },
        {
            "country": "Nepal",
            "population": "29304998"
        },
        {
            "country": "Netherlands",
            "population": "17035938"
        },
        {
            "country": "Netherlands Antilles",
            "population": "217000"
        },
        {
            "country": "New Caledonia",
            "population": "276255"
        },
        {
            "country": "New Zealand",
            "population": "4705818"
        },
        {
            "country": "Nicaragua",
            "population": "6217581"
        },
        {
            "country": "Niger",
            "population": "21477348"
        },
        {
            "country": "Nigeria",
            "population": "190886311"
        },
        {
            "country": "Niue",
            "population": "1618"
        },
        {
            "country": "Norfolk Island",
            "population": "2000"
        },
        {
            "country": "North Korea",
            "population": "25490965"
        },
        {
            "country": "Northern Ireland",
            "population": null
        },
        {
            "country": "Northern Mariana Islands",
            "population": "55144"
        },
        {
            "country": "Norway",
            "population": "5305383"
        },
        {
            "country": "Oman",
            "population": "4636262"
        },
        {
            "country": "Pakistan",
            "population": "197015955"
        },
        {
            "country": "Palau",
            "population": "21729"
        },
        {
            "country": "Palestine",
            "population": "4920724"
        },
        {
            "country": "Panama",
            "population": "4098587"
        },
        {
            "country": "Papua New Guinea",
            "population": "8251162"
        },
        {
            "country": "Paraguay",
            "population": "6811297"
        },
        {
            "country": "Peru",
            "population": "32165485"
        },
        {
            "country": "Philippines",
            "population": "104918090"
        },
        {
            "country": "Pitcairn",
            "population": "50"
        },
        {
            "country": "Poland",
            "population": "38170712"
        },
        {
            "country": "Portugal",
            "population": "10329506"
        },
        {
            "country": "Puerto Rico",
            "population": "3663131"
        },
        {
            "country": "Qatar",
            "population": "2639211"
        },
        {
            "country": "Reunion",
            "population": "699000"
        },
        {
            "country": "Romania",
            "population": "19679306"
        },
        {
            "country": "Russian Federation",
            "population": "143989754"
        },
        {
            "country": "Rwanda",
            "population": "12208407"
        },
        {
            "country": "Saint Helena",
            "population": "4049"
        },
        {
            "country": "Saint Kitts and Nevis",
            "population": "55345"
        },
        {
            "country": "Saint Lucia",
            "population": "178844"
        },
        {
            "country": "Saint Pierre and Miquelon",
            "population": "6320"
        },
        {
            "country": "Saint Vincent and the Grenadines",
            "population": "109897"
        },
        {
            "country": "Samoa",
            "population": "196440"
        },
        {
            "country": "San Marino",
            "population": "33400"
        },
        {
            "country": "Sao Tome and Principe",
            "population": "204327"
        },
        {
            "country": "Saudi Arabia",
            "population": "32938213"
        },
        {
            "country": "Scotland",
            "population": null
        },
        {
            "country": "Senegal",
            "population": "15850567"
        },
        {
            "country": "Seychelles",
            "population": "94737"
        },
        {
            "country": "Sierra Leone",
            "population": "7557212"
        },
        {
            "country": "Singapore",
            "population": "5708844"
        },
        {
            "country": "Slovakia",
            "population": "5447662"
        },
        {
            "country": "Slovenia",
            "population": "2079976"
        },
        {
            "country": "Solomon Islands",
            "population": "611343"
        },
        {
            "country": "Somalia",
            "population": "14742523"
        },
        {
            "country": "South Africa",
            "population": "56717156"
        },
        {
            "country": "South Georgia and the South Sandwich Islands",
            "population": null
        },
        {
            "country": "Korea, South",
            "population": "50982212"
        },
        {
            "country": "South Sudan",
            "population": "12575714"
        },
        {
            "country": "Spain",
            "population": "46354321"
        },
        {
            "country": "Sri Lanka",
            "population": "20876917"
        },
        {
            "country": "Sudan",
            "population": "40533330"
        },
        {
            "country": "Suriname",
            "population": "563402"
        },
        {
            "country": "Svalbard and Jan Mayen",
            "population": "3200"
        },
        {
            "country": "Swaziland",
            "population": "1008000"
        },
        {
            "country": "Sweden",
            "population": "9910701"
        },
        {
            "country": "Switzerland",
            "population": "8476005"
        },
        {
            "country": "Syria",
            "population": "18269868"
        },
        {
            "country": "Tajikistan",
            "population": "8921343"
        },
        {
            "country": "Tanzania",
            "population": "57310019"
        },
        {
            "country": "Thailand",
            "population": "69037513"
        },
        {
            "country": "The Democratic Republic of Congo",
            "population": null
        },
        {
            "country": "Togo",
            "population": "7797694"
        },
        {
            "country": "Tokelau",
            "population": "1300"
        },
        {
            "country": "Tonga",
            "population": "108020"
        },
        {
            "country": "Trinidad and Tobago",
            "population": "1369125"
        },
        {
            "country": "Tunisia",
            "population": "11532127"
        },
        {
            "country": "Turkey",
            "population": "80745020"
        },
        {
            "country": "Turkmenistan",
            "population": "5758075"
        },
        {
            "country": "Turks and Caicos Islands",
            "population": "35446"
        },
        {
            "country": "Tuvalu",
            "population": "11192"
        },
        {
            "country": "Uganda",
            "population": "42862958"
        },
        {
            "country": "Ukraine",
            "population": "44222947"
        },
        {
            "country": "United Arab Emirates",
            "population": "9400145"
        },
        {
            "country": "United Kingdom",
            "population": "66181585"
        },
        {
            "country": "US",
            "population": "324459463"
        },
        {
            "country": "United States Minor Outlying Islands",
            "population": null
        },
        {
            "country": "Uruguay",
            "population": "3456750"
        },
        {
            "country": "Uzbekistan",
            "population": "31910641"
        },
        {
            "country": "Vanuatu",
            "population": "276244"
        },
        {
            "country": "Venezuela",
            "population": "31977065"
        },
        {
            "country": "Vietnam",
            "population": "95540800"
        },
        {
            "country": "Virgin Islands, British",
            "population": null
        },
        {
            "country": "Virgin Islands, U.S.",
            "population": null
        },
        {
            "country": "Wales",
            "population": null
        },
        {
            "country": "Wallis and Futuna",
            "population": "11773"
        },
        {
            "country": "Western Sahara",
            "population": "552628"
        },
        {
            "country": "Yemen",
            "population": "28250420"
        },
        {
            "country": "Yugoslavia",
            "population": "10640000"
        },
        {
            "country": "Zambia",
            "population": "17094130"
        },
        {
            "country": "Zimbabwe",
            "population": "16529904"
        }
    ];
    let population;
    if (selectedCountry != "all") {
        let filtered = dict.filter(element => element.country == selectedCountry);
        if (filtered.length == 0) {
            population = 1;
        } else {
            population = filtered[0].population;
        }
    } else {
        population = 7e9;
    }
    document.getElementById("N").value = population;
}

function filterFromFirstCase(timeseries) {
    let output = [];
    let stillNotFound = true;
    for (let i = 0; i < timeseries.length; i++) {
        if (timeseries[i].confirmed == 0 && stillNotFound)
            continue;
        output.push(timeseries[i]);
        stillNotFound = false;
    }
    return output;
}