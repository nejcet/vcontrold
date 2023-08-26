const VControl = require("vcontrol")
const fs = require('fs')
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')
const axios = require('axios')

const prometheusPushgatewayHost = process.env.PROMETHEUS_PUSH_GATEWAY_HOST || '192.168.10.3'

const vControl = new VControl({
    host: "127.0.0.1",
    port: 3002,
    //debug: true
})

const argv = yargs(hideBin(process.argv)).argv

if (!argv.o) {
    console.log("invalid parameters given, example: node index.js -o ./export.json")
    process.exit(1)
}

const readData = (command) => {
    return new Promise(async (resolve, reject) => {
        try {
            let timer = setTimeout(() => {
                timer = null
                throw new Error('timeout error')
            }, 20000)
            const raw = await vControl.getData(command)
            if (timer) {
                clearTimeout(timer)
                resolve(raw)
            }
        } catch (error) {
            reject(error)
        }
    })
}

const convertToTemperature = (hexString) => {
    let value = null
    const buff = Buffer.from(hexString.replace(/ /g, ''), "hex")
    if (buff[0] === 0x05) {
        const first = buff[1]
        const second = buff[2]
        const slicedBuff = buff.subarray(3)
        const foundNextFirstPosition = slicedBuff.findIndex(num => num === first)
        if (foundNextFirstPosition >= 0 && slicedBuff[foundNextFirstPosition + 1] === second) {
            value = Buffer.from([first, second]).readInt16LE()
        }
    }
    if (value === null) value = Buffer.from([buff[0], buff[1]]).readInt16LE()
    return value / 10
}

const convertToBoolean = (hexString) => {
    console.log('convertToBoolean',hexString )
    const buff = Buffer.from(hexString.replace(/ /g, ''), "hex")
    console.log('convertToBoolean buff',hexString.replace(/ /g, ''), buff )
    return buff[0] === 0x05 ? buff[1] : buff[0]
}

const pushTopPrometheus = async (data) => {
    await axios.post(`http://${prometheusPushgatewayHost}:9091/metrics/job/vcontrold/instance/rpi/provider/viessmann`,
        data,
        {
            headers: {
                'Content-Type': 'text/plain'
            }
        }
    )
}

const dataSource = [
    {
        command: "getAussenTemp",
        name: "aussenTemp",
        transform: convertToTemperature
    },
    {
        command: "getPrimaerEin",
        name: "primaerEin",
        transform: convertToTemperature
    },
    {
        command: "getSekundaerVorlauf",
        name: "sekundaerVorlauf",
        transform: convertToTemperature
    },
    {
        command: "getSekundaerRuecklauf",
        name: "sekundaerRuecklauf",
        transform: convertToTemperature
    },
    {
        command: "getWWSpeicherOben",
        name: "wwSpeicherOben",
        transform: convertToTemperature
    },
    {
        command: "getWWSpeicherUnten",
        name: "wwSpeicherUnten",
        transform: convertToTemperature
    },
    {
        command: "getSollTempHeizkreis",
        name: "sollHeizkreis",
        transform: convertToTemperature
    },

    {
        command: "getWaermepumpeStatus",
        name: "waermepumpeStatus",
        transform: convertToBoolean
    },
    {
        command: "getPrimaerpumpeStatus",
        name: "primaerpumpeStatus",
        transform: convertToBoolean
    },
    {
        command: "getWarmwassererwaermungStatus",
        name: "warmwassererwaermungStatus",
        transform: convertToBoolean
    },
    {
        command: "getUmwaelzpumpeWarmwasserStatus",
        name: "umwaelzpumpeWarmwasserStatus",
        transform: convertToBoolean
    }
]

const resetValues = async (error) => {
    const values = []
    for (let i = 0; i < dataSource.length; i++) {
        const item = dataSource[i]
        values.push({
            command: item.name,
            value: 0,
            raw: 0,
            error: error
        })
    }
    fs.writeFileSync(argv.o, JSON.stringify(values), { encoding: 'utf8', flag: 'w' })
}

const fetchData = async () => {
    const values = [] // [{"command":"getAussenTemp","value":8.000000,"raw":"8F 00 FE 00 8F 00 AE 01 00 ","error":""}]
    try {
        let prometheusData = ''
        await vControl.connect()
        for (let i = 0; i < dataSource.length; i++) {
            const item = dataSource[i]
            const raw = await readData(item.command)
            const value = item.transform(raw)
            console.log(item.name, value)
            values.push({
                command: item.name,
                value: value,
                raw: raw,
                error: ''
            })
            if (value > 80) {
                prometheusData += `wrongValue ${raw}\n`
            }
        }
        await vControl.close()
        prometheusData += values.map(item => `${item.command} ${item.value}\n`).join('')
        await pushTopPrometheus(prometheusData)
        fs.writeFileSync(argv.o, JSON.stringify(values), { encoding: 'utf8', flag: 'w' })
    } catch (error) {
        console.log('error', error)
        await pushTopPrometheus(`error ${error.message}\n`)
        await resetValues(error)
        process.exit(1)
    }

}
fetchData()

