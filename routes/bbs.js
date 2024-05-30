var express = require('express')
var router = express.Router();

var crypto = require('crypto');
var oracledb= require('oracledb');
oracledb.autoCommit = true;

var dbconfig = {  // DB 연결 설정
    user : "TEST_USER",
    password : "1234",
    connectString : "localhost/XEPDB1"
};

router.get("/", function (req, res, next) {
    res.redirect("/bbs/list");
});

async function countRecord() {
    return new Promise( function (resolve, reject) {
        oracledb.getConnection(dbconfig, function (err, connection) {
            var sql = "SELECT COUNT(*) FROM BBS";
            connection.execute(sql, function (err, count) {
                if (err) console.error(`err : ${err}`);

                var totalRecords = parseInt(count.rows);
                connection.release();
                resolve(totalRecords);
            });
        });
    });
}

router.get("/list", function (req, res, next) {
    var stNum = 0, totalRecords = 0, totalPage = 0, firstPage = 0, lastPage = 0, currentPage = 1, blockSize = 5, pageSize = 5;
    var userId = req.session.user;
    var isLoggedIn = false;
    if (userId) {
        isLoggedIn = true;
    }
    countRecord().then( function (totalRecords) {
        if (req.query.currentPage != undefined) {
            currentPage = parseInt(req.query.currentPage);
        }

        totalPage = Math.ceil(totalRecords/pageSize);
        firstPage = 1;
        lastPage = totalPage;
        stNum = (currentPage - 1) * pageSize;

        oracledb.getConnection(dbconfig, function (err, connection) {
            var sql = `SELECT NO, TITLE, WRITER, to_char(REGDATE, 'yyyy-mm-dd hh24:mi'), READ_COUNT, OK FROM BBS ORDER BY NO DESC OFFSET ${stNum} ROWS FETCH NEXT ${pageSize} ROWS ONLY`;

            connection.execute(sql, function (err, rows) {
                if (err) console.error(`err : ${err}`);

                res.render("bbs/list", {
                    rows: rows,
                    currentPage: currentPage,
                    totalRecords: totalRecords,
                    pageSize: pageSize,
                    totalPage: totalPage,
                    blockSize: blockSize,
                    firstPage: firstPage,
                    lastPage: lastPage,
                    stNum: stNum,
                    isLoggedIn: isLoggedIn
                });
                connection.release();
            });
        });
    });
});

router.get("/read", function (req, res, next) {
    oracledb.getConnection(dbconfig, function (err, connection) {
        var sql = `UPDATE BBS SET READ_COUNT=READ_COUNT + 1 WHERE NO=${req.query.brdno}`;
        connection.execute(sql, function (err, rows) {
            if (err) console.error(`err : ${err}`);
            connection.release();
        });
    });

    oracledb.getConnection(dbconfig, function (err, connection) {
        var sql = `SELECT NO, TITLE, CONTENT, WRITER, to_char(REGDATE,'yyyy-mm-dd hh24:mi:ss'), READ_COUNT, ID FROM BBS WHERE NO=${req.query.brdno}`;

        connection.execute(sql, function (err, rows) {
            if (err) console.error(`err : ${err}`);
            console.log(rows.rows)
            if (req.session.user) {
                rows.rows[0][7] = req.session.user.id;
            }
            res.render("bbs/read", rows);
            connection.release();
        });
    });
});

router.get("/form", function (req, res, next) {
    var userId = req.session.user;
    if (userId) {
        if (!req.query.brdno) {
            res.render("bbs/form", {rows: ""});
            return ;
        }
        oracledb.getConnection(dbconfig, function (err, connection) {
            var sql = `SELECT NO, TITLE, CONTENT, WRITER, REGDATE FROM BBS WHERE NO=${req.query.brdno}`

            connection.execute(sql, function (err, rows) {
                if (err) console.error(`err : ${err}`);

                res.render("bbs/updateform", rows);
                connection.release();
            });
        });
    } else {
        console.log("로그인 되어 있지 않습니다!");
        res.redirect("/bbs/login");
    }
});

router.post("/save", function (req, res, next) {
    if (req.session.user) {
        oracledb.getConnection(dbconfig, function (err, connection) {
            if (req.body.brdno) {
                var sql = `UPDATE BBS SET TITLE='${req.body.brdtitle}', CONTENT='${req.body.brdmemo}', WRITER='${req.body.brdwriter}' WHERE NO=${req.body.brdno}`;
            } else {
                var sql = `INSERT INTO BBS(NO, TITLE, CONTENT, WRITER, REGDATE) VALUES(bbs_seq.nextval, '${req.body.brdtitle}', '${req.body.brdmemo}', '${req.body.brdwriter}', sysdate)`;
            }

            connection.execute(sql, function (err, rows) {
                if (err) console.error(`err : ${err}`);

                res.redirect("/bbs/list");
                connection.release();
            });
        });
    } else {
        console.log("로그인 되어 있지 않습니다.");
        res.redirect("/bbs/login");
    }
});

router.get("/delete", function (req, res, next) {
    oracledb.getConnection(dbconfig, function (err, connection) {
        var sql = `DELETE FROM BBS WHERE NO=${req.query.brdno}`;

        connection.execute(sql, function (err, rows) {
            if (err) console.error(`err : ${err}`);

            res.redirect("/bbs/list");
            connection.release();
        });
    })
});

router.get("/wlist", function (req, res, next) {
    oracledb.getConnection(dbconfig, function (err, connection) {
        var sql = `SELECT NO, BBS_NO, WRITER, CONTENT, to_char(REGDATE,'yyyy-mm-dd hh24:mi:ss') FROM BBSW WHERE BBS_NO=${req.query.bbs_no} ORDER BY NO ASC`;
        connection.execute(sql, function (err, rows) {
            if (err) console.error(`err : ${err}`);

            var brdNo = req.query.bbs_no;
            res.render("bbs/write", {rows:rows, brdNo:brdNo});
            connection.release();
        });
    });
});

router.post("/write", function (req, res, next) {
    oracledb.getConnection(dbconfig, function (err, connection) {
        if (req.body.brdno1) {
            var sql = `UPDATE BBSW SET WRITER='${req.body.brdwriter1}', CONTENT='${req.body.brdmemo1}' WHERE NO=${req.body.brdno1}`;
        } else {
            var sql = `INSERT INTO BBSW(NO, BBS_NO, WRITER, CONTENT) VALUES(bbsw_seq.nextval, '${req.body.bbs_no}', '${req.body.brdwriter1}', '${req.body.brdmemo1}')`;
        }

        connection.execute(sql, function (err, rows) {
            if (err) console.error(`err : ${err}`);

            res.redirect(`/bbs/wlist?bbs_no=${req.body.bbs_no}`);
            connection.release();
        });
    });
});

router.get("/wform", function (req, res, next) {
    if (!req.query.brdno1) {
        res.render("bbs/write", {row: ""});
        return;
    }
    oracledb.getConnection(dbconfig, function (err, connection) {
        var sql = `SELECT NO, BBS_NO, WRITER, CONTENT FROM BBSW WHERE NO=${req.query.brdno1}`;

        connection.execute(sql, function (err, rows) {
            if (err) console.error(`err : ${err}`);

            res.render("bbs/writeupdate", rows);
            connection.release();
        });
    });
});

router.get("/wdelete", function (req, res, next) {
    oracledb.getConnection(dbconfig, function (err, connection) {
        var sql = `DELETE FROM BBSW WHERE NO=${req.query.brdno1}`;

        connection.execute(sql, function (err, rows) {
            if (err) console.error(`err : ${err}`);

            res.redirect(`/bbs/wlist?bbs_no=${req.query.bbs_no}`);
            connection.release();
        });
    });
});

router.get("/search", function (req, res, next) {
    oracledb.getConnection(dbconfig, function (err, connection) {
        if (req.query.choice == "TITLE_CONTENT") {
            var sql = `SELECT NO, TITLE, WRITER, to_char(REGDATE, 'yyyy-mm-dd hh24:mi:ss'), OK FROM BBS WHERE TITLE LIKE '%${req.query.search}%' OR CONTENT LIKE '%${req.query.search}%' ORDER BY NO ASC`;
        } else {
            var sql = `SELECT NO, TITLE, WRITER, to_char(REGDATE, 'yyyy-mm-dd hh24:mi:ss'), OK FROM BBS WHERE ${req.query.choice} LIKE '%${req.query.search}%' ORDER BY NO ASC`
        }
        connection.execute(sql, function (err, rows) {
            if (err) console.error(`err : ${err}`);

            res.render("bbs/searchLIst", rows);
            connection.release()
        })
    });
});

router.get("/signup", function (req, res, next) {
    var code = 0;
    res.render("bbs/signup", {errcode:code});
});

router.post("/signup", function (req, res, next) {
    var id = req.body.id;
    var pw = req.body.password;
    var name = req.body.name;
    var password_check = req.body.password_check;
    var email = req.body.email;

    var code = 0;
    if (id.length < 4) {
        return res.render("bbs/signup", {errcode: 2});
    }
    if (pw !== password_check || pw.length == 0) {
        return res.render("bbs/signup", {errcode: 3});
    }
    if (!name) {
        return res.render("bbs/signup", {errcode: 4});
    }

    var salt = Math.round(new Date().valueOf()*Math.random()) + "";
    var hashPassword = crypto.createHash("sha512").update(pw+salt).digest("base64");

    oracledb.getConnection(dbconfig, function (err, connection) {
        var sql = `INSERT INTO LOGIN(ID, PASSWORD, NAME, EMAIL, SALT) VALUES('${id}', '${hashPassword}', '${name}', '${email}', '${salt}')`;
        connection.execute(sql, function (err, rows) {
            if (err) {
                code = 1;
                console.error(`err : ${err}`);
                res.render("bbs/signup", {errcode: code});
            }
            res.redirect("/bbs/list");
            connection.release();
        });
    });
});

router.get("/login", function (req, res, next) {
    var code = 0;
    res.render("bbs/login", {errcode:code})
});

router.post("/login", function (req, res, next) {
    var id = req.body.id;
    var pw = req.body.password;
    var code = 0;
    oracledb.getConnection(dbconfig, function (err, connection) {
        var sql = `SELECT OK, PASSWORD, SALT FROM LOGIN WHERE ID = '${id}'`;

        connection.execute(sql, function(err, results) {
            if (err) console.error(`err : ${err}`);

            var dbhashPassword = results.rows[0][1];
            var salt = results.rows[0][2];
            var hashPassword = crypto.createHash("sha512").update(pw+salt).digest("base64");

            if (results.rows.length < 1) {
                console.log("로그인 아이디가 없습니다!");
                code = 1;
                res.render("bbs/login", {errcode: code});
                return;
            } else if (dbhashPassword == hashPassword) {
                const paramID = req.body.id || req.query.id;
                const pwd = req.body.password || req.query.password;
                if (req.session.user) {
                    console.log("이미 로그인 되어 있습니다!");
                } else {
                    console.log("사용자 정보 저장!");
                    req.session.user = {
                        id: paramID,
                        pwd: pwd,
                        authorized: true
                    };
                }
            } else {
                console.log("패스워드가 틀렸습니다!");
                code = 2;
                res.render("bbs/login", {errcode:code});
                return ;
            }
            res.redirect("/bbs/list");
            connection.release();
        });
    });
});

router.get("/updatesignup", function (req, res, next) {
    var code = 0;
    var id =  req.session.user.id;
    oracledb.getConnection(dbconfig, function (err, connection) {
        var sql = `SELECT NAME, EMAIL FROM LOGIN WHERE ID = '${id}'`;

        connection.execute(sql, function (err, rows) {
            if (err) console.error(`err : ${err}`);
            console.log(rows.rows);
            res.render("bbs/updateUser", {
                errcode: code,
                id: id,
                name: rows.rows[0][0],
                email: rows.rows[0][1]
            });
        });
    });
});

router.post("/updatesignup", function (req, res, next) {
    var id = req.body.id;
    var pw = req.body.password;
    var name = req.body.name;
    var password_check = req.body.password_check;
    var email = req.body.email;
    var code = 0;
    console.log(id, name, email)
    if (pw !== password_check || pw.length == 0) {
        return res.render("bbs/updateUser", {
            errcode: 3,
            id: id,
            name: name,
            email: email
        });
    }
    if (!name) {
        return res.render("bbs/updateUser", {
            errcode: 4,
            id: id,
            name: name,
            email: email
        });
    }
    var salt = Math.round(new Date().valueOf()*Math.random()) + "";
    var hashPassword = crypto.createHash("sha512").update(pw+salt).digest("base64");

    oracledb.getConnection(dbconfig, function (err, connection) {
        var sql = `UPDATE LOGIN SET PASSWORD='${hashPassword}', NAME='${name}', EMAIL='${email}', SALT='${salt}'`;
        connection.execute(sql, function (err, rows) {
            if (err) console.error(`err : ${err}`);

            res.redirect("/bbs/list");
            connection.release();
        });
    });
});

router.get("/logout", function (req, res, next) {
    if (req.session) {
        req.session.destroy(()=>{
            res.redirect("/bbs/list");
        });
    }
})

router.get("/resign", function (req, res, next) {
    id = req.session.user.id;
    if (req.session) {
        req.session.destroy(()=>{
        });
    }
    oracledb.getConnection(dbconfig, function (err, connection) {
        var sql = `DELETE FROM LOGIN WHERE ID='${id}'`;
        connection.execute(sql, function (err, rows) {
            if (err) console.error(`err : ${err}`);

            res.redirect("/bbs/list");
            connection.release();
        });
    });
})

module.exports = router;
