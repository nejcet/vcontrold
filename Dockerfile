FROM node:13-buster-slim

RUN DEBIAN_FRONTEND=noninteractive apt-get update
RUN apt-get install -y build-essential vim subversion automake autoconf libxml2-dev mosquitto-clients git cmake jq iputils-ping 
RUN mkdir openv && cd openv && \
    git clone https://github.com/openv/vcontrold.git vcontrold-code && \
    cmake ./vcontrold-code -DVSIM=ON -DMANPAGES=OFF && \
    make && \
    make install

ADD mqtt_publish.sh /etc/vcontrold/
RUN chmod +x /etc/vcontrold/mqtt_publish.sh
#ADD mqtt_sub.sh /etc/vcontrold/
ADD startup.sh /

ADD index.js /etc/vcontrold/export.js
ADD package.json /etc/vcontrold/
ADD package-lock.json /etc/vcontrold/
RUN cd /etc/vcontrold/ && npm i

EXPOSE 3002/udp
ENTRYPOINT ["sh","/startup.sh"]
