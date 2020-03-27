let chart = null;
let chartState = [];//stores visibility of graphs

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
        N = Number(document.getElementById("N").value);
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

function fetchLatestData(finishedFetchingData) {
    let xhr = new XMLHttpRequest();

    xhr.addEventListener("readystatechange", function () {
        if (this.readyState === this.DONE) {
            let JSONResponse = JSON.parse(this.response);
            let countries = Object.keys(JSONResponse);
            let days = JSONResponse[countries[0]].length;
            let timeSeries = [];

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

            fetchedData = timeSeries;
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

        fetchedData[i].beta = beta;
        fetchedData[i].alpha = alpha;


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

    document.getElementById("betaText").innerHTML = beta.toFixed(3);
    document.getElementById("alphaText").innerHTML = alpha.toFixed(3);
    document.getElementById("R0Text").innerHTML = (beta / alpha).toFixed(2);
    computeAndGraph((beta / alpha).toFixed(2));
}


function computeAndGraph(R0) {
    showBanner("Computing...");

    let I0 = Number(document.getElementById("I0").value);
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

    let I = I0;
    let S = N;
    let R = 0;

    let counter = 0;
    //let skipEvery = Math.round((maxTime / delT) / 100);//so that the final number of data points is always a hundred
    for (let t = 0; t <= maxTime; t += delT) {
        let delS = -beta * S * I / N * delT;
        let delI = beta * S * I / N * delT - alpha * I * delT;
        let delR = alpha * I * delT;
        S += delS;
        I += delI;
        R += delR;
        /*
        if (counter % skipEvery == 0) {
            I_ar.push(I);
            S_ar.push(S);
            R_ar.push(R);
            t_ar.push(Number(t.toFixed(2)));
            I_plus_R_ar.push(I + R);
        }
        counter++;
        */
        let t_rounded = Number(t.toFixed(2));
        if (Number.isInteger(t_rounded)) {
            //only plot daily data
            I_ar.push(I);
            S_ar.push(S);
            R_ar.push(R);
            t_ar.push(t_rounded);
            I_plus_R_ar.push(I + R);

            if (t_rounded < fetchedData.length) {
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
                        beginAtZero: true,
                        //max: y0
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