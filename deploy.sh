#!/bin/bash

# exit when any command fails
set -e

mkdir -p artifacts

yarn cdk deploy 'remix' \
  -c stage=$STAGE \
  --outputs-file ./artifacts/remix.json
