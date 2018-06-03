#!/bin/bash

echo "avvio server"

icecast -c ./icecast_conf/icecast.xml &

ices -c ./icecast_conf/ices1.xml &
ices -c ./icecast_conf/ices2.xml &
ices -c ./icecast_conf/ices3.xml &

wait

echo "all process complete"