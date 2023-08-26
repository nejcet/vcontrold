#!/bin/bash
jq -c '.[]' /etc/vcontrold/result.json | while read i; do
    COMMAND=$(echo $i | jq -r ' .command')
    RAW=$(echo $i | jq -r ' .value')
    PAYLOAD=$(echo $i | jq -r '. ')
    #echo $PAYLOAD
    mosquitto_pub -u $MQTTUSER -P $MQTTPASSWORD -h $MQTTHOST -p $MQTTPORT -t $MQTTTOPIC/$COMMAND -m "$PAYLOAD" -c --id "VCONTROLD-PUB"
done
