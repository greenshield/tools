var mongo = require('mongodb')
var objectID = mongo.ObjectID
var Moment = require('moment-timezone')
const bcrypt = require('bcryptjs')
const async = require('async')
const fs = require('fs')
const crypto = require('crypto')
const algorithm = 'aes-256-cbc'
const iv = crypto.randomBytes(16)

var key = null

var oid = (m = Math, d = Date, h = 16, s = (s) => m.floor(s).toString(h)) =>
	s(d.now() / 1000) + ' '.repeat(h).replace(/./g, () => s(m.random() * h))

var tools = function (database, encryptKey, lp, master) {
	key = encryptKey

	return {
		ouuid: (m = Math, d = Date, h = 16, s = (s) => m.floor(s).toString(h)) =>
			s(d.now() / 1000) + ' '.repeat(h).replace(/./g, () => s(m.random() * h)),
		connEnd: function (client) {
			client.end()
			return true
		},
		bcrypt: bcrypt,
		hash: async function (password) {
			let hash = await bcrypt.hash(password, bcrypt.genSaltSync(10))

			return hash
		},
		encrypt: async function (text) {
			let cipher = crypto.createCipheriv(
				'aes-256-cbc',
				Buffer.from(key, 'hex'),
				iv
			)
			let encrypted = cipher.update(text)
			encrypted = Buffer.concat([encrypted, cipher.final()])
			return Promise.resolve({
				iv: iv.toString('hex'),
				encryptedData: encrypted.toString('hex'),
			})
		},
		decrypt: async function (text) {
			let iv = Buffer.from(text.iv, 'hex')
			let encryptedText = Buffer.from(text.encryptedData, 'hex')
			let decipher = crypto.createDecipheriv(
				'aes-256-cbc',
				Buffer.from(key, 'hex'),
				iv
			)
			let decrypted = decipher.update(encryptedText)
			decrypted = Buffer.concat([decrypted, decipher.final()])
			return Promise.resolve(decrypted.toString())
		},

		filter: async function () {
			var final_options = [
				{
					$facet: {
						data: [
							{ $sort: { name: 1 } },
							{
								$lookup: {
									from: 'category',
									localField: 'category',
									foreignField: '_id',
									as: 'category',
								},
							},
							{
								$unwind: {
									path: '$category',
									preserveNullAndEmptyArrays: true,
								},
							},
							{ $match: { deleted: { $ne: true } } },
							{ $limit: 50 },
							{ $skip: 25 },
						],
						total: [
							{ $sort: { name: 1 } },
							{
								$lookup: {
									from: 'category',
									localField: 'category',
									foreignField: '_id',
									as: 'category',
								},
							},
							{
								$unwind: {
									path: '$category',
									preserveNullAndEmptyArrays: true,
								},
							},
							{ $match: { deleted: { $ne: true } } },
							{ $count: 'total' },
						],
					},
				},
			]
		},
		update: async function (id, updateObj, coll, db) {
			var filter = { _id: objectID(id) }

			var d = new Date()
			var n = d.getTime()

			if (!id && !updateObj._id) {
				updateObj._id = objectID(oid())
				filter = { _id: updateObj._id }
			}

			var updates = { $set: updateObj }

			if (!master) {
				var use_db = db ? db._id.toString() : null

				if (use_db) {
					var dbo = lp.db(use_db)
				} else {
					dbo = database
				}
			} else {
				dbo = database
			}

			let update = dbo.collection(coll).updateMany(filter, updates)

			return new Promise(function (resolve, reject) {
				if (update) {
					resolve(update)
				} else {
					reject(false)
				}
			})
		},
		insert: async function (docs, coll, options, db) {
			// Get the documents collection
			new_docs = docs.map((doc) => {
				if (!doc._id) {
					doc._id = objectID(oid())

					if (!doc.email) {
						delete doc.email
					}

					if (!doc.phone_number) {
						delete doc.phone_number
					}

					doc.insert_stamp = Moment().valueOf()
				}

				return doc
			})

			if (!master) {
				var use_db = db ? db._id.toString() : null

				if (use_db) {
					var dbo = lp.db(use_db)
				} else {
					dbo = database
				}
			} else {
				dbo = database
			}

			const collection = dbo.collection(coll)
			// Insert some documents

			var ret = {}

			let inserted = await collection.insertMany(new_docs, {
				ordered: options && options.ordered ? true : false,
			})

			ret = inserted

			return ret
		},
		uuid: function () {
			function s4() {
				return Math.floor((1 + Math.random()) * 0x10000)
					.toString(16)
					.substring(1)
			}
			return s4() + s4() + s4() + s4() + s4()
		},
		short: function () {
			function s4() {
				return Math.floor((1 + Math.random()) * 0x10000)
					.toString(16)
					.substring(1)
			}
			return s4() + s4()
		},
		code: function () {
			return Math.floor(1000 + Math.random() * 9000)
		},
		orm: function (type, conn) {
			var obj = {}
			obj.type = type
			obj.key = function (key, val) {
				this['k'] = [key, val]
			}
			obj.set = function (key, val) {
				this[key] = val
			}
			obj.get = function (key) {
				return this[key]
			}
			obj.save = function () {
				var fields = []
				var funcs = []
				funcs.push('set')
				funcs.push('get')
				funcs.push('save')
				funcs.push('key')
				funcs.push('type')
				funcs.push('k')

				var sql = ''

				if (obj['k']) {
					sql += 'update ' + obj['type']
				} else {
					sql += 'insert into ' + obj['type'] + '('
					var columns = ''
					var vals = ''
				}

				var propcount = 0
				for (var prop in obj) {
					if (obj.hasOwnProperty(prop) && !funcs.includes(prop)) {
						if (obj['k']) {
							if (propcount == 0) {
								sql += ' set ' + prop + ' = ' + "'" + obj[prop] + "'"
							} else {
								sql += ', ' + prop + ' = ' + "'" + obj[prop] + "'"
							}
						} else {
							if (propcount == 0) {
								vals += "'" + obj[prop] + "'"
								columns += prop
							} else {
								vals += ",'" + obj[prop] + "'"
								columns += ', ' + prop
							}
						}
						propcount++
					}
				}

				if (obj['k']) {
					sql += ' where ' + obj['k'][0] + ' = ' + obj['k'][1]
				} else {
					sql += columns + ')'
					sql += ' values('
					sql += vals
					sql += ')'
				}

				//        return sql;

				return new Promise((resolve, reject) => {
					conn.query(sql, function (err, result) {
						if (err) {
							//console.log(err)
							return reject(err)
						}
						return resolve(result)
					})
				})
			}
			return obj
		},

		formatter: function (amount) {
			var converter = new Intl.NumberFormat('en-US', {
				style: 'currency',
				currency: 'USD',
				minimumFractionDigits: 2,
			})

			return converter.format(amount)
		},
		push: function (cols, rows, res, filename) {
			var response = ''

			var headers = cols.map((col, index) => {
				return col.accessor
			})

			var columns = headers.join(',')

			response += columns + '\r\n'

			rows.forEach((row, index) => {
				var cols = headers.map((header, index) => {
					return row[header]
				})

				var columns = cols.join(',')

				response += columns + '\r\n'
			})

			res.setHeader(
				'Content-disposition',
				'attachment; filename=' + filename ? filename : 'report.csv'
			)
			res.setHeader('Content-Type', 'text/csv')
			res.status(200).send(response)
		},
		emailIsValid: function (email) {
			return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
		},
		numbers_only: function (number) {
			var myString = number.replace(/\D/g, '')
			return myString
		},
		phone_number_only: function (number) {
			var myString = number.replace(/\D/g, '').replace(/^\+[0-9]/, '')
			return myString
		},
		upload: function (files, bucket) {
			var uploads = []

			return new Promise((resolve, reject) => {
				var tasks = []

				if (Array.isArray(files.file)) {
					files.file.forEach((val, i) => {
						var uuid = this.uuid()

						var task = function (callback) {
							fs.createReadStream(val.path)
								.pipe(bucket.openUploadStream(uuid + '_' + val.name))
								.on('error', function (error) {
									assert.ifError(error)
								})
								.on('finish', function (f) {
									uploads.push(f.filename)
									callback()
								})
						}

						tasks.push(task)
					})
				} else {
					var uuid = this.uuid()

					var task = function (callback) {
						fs.createReadStream(files.file.path)
							.pipe(bucket.openUploadStream(uuid + '_' + files.file.name))
							.on('error', function (error) {
								assert.ifError(error)
							})
							.on('finish', function (f) {
								uploads.push(f.filename)
								callback()
							})
					}

					tasks.push(task)
				}

				async.parallel(tasks, function (err) {
					if (err) {
						return reject(err)
					}

					return resolve({ files: uploads })
				})
			})
		},
	}
}

var _tools = tools()

export default _tools