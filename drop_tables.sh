#!/usr/bin/mongo

use trackDB;
db.tracks.files.deleteMany({});
db.tracks.chunks.deleteMany({});