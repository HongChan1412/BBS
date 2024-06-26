var express = require('express')
var router = express.Router();

var crypto = require('crypto');
var oracledb= require('oracledb');

const multer = require('multer');
const path = require("path");

oracledb.autoCommit = true;

var dbconfig = {  // DB 연결 설정
    user : "TEST_USER",
    password : "1234",
    connectString : "localhost/XEPDB1"
};

const storage= multer.diskStorage({ function (req, file, cb) { //multer 설정
    cb(null, "files/")
    },
    filename: function (req, file, cb) {
    const originalName = file.originalname;
    const now = new Date();

    const timestamp = now.getFullYear() +
        padZero(now.getMonth() + 1) +
        padZero(now.getDate()) +
        padZero(now.getHours()) +
        padZero(now.getMinutes()) +
        padZero(now.getSeconds());

    const fileName = timestamp + '_' + originalName;
    cb(null, fileName)
    }
});

function padZero(num) {
    return num < 10 ? "0" + num : num;
}

const upload = multer({ storage: storage });

router.get("/", function (req, res, next) { // index 페이지
    res.redirect("/bbs/list");
});

async function countRecord() { //조회수 읽는 함수
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
    var isLoggedIn = false;
    if (req.session.user) {
        isLoggedIn = true;
    }
    countRecord().then( function (totalRecords) {  // 페이징 기능
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
    oracledb.getConnection(dbconfig, function (err, connection) { // 글 조회 할때마다 조회수 1 증가
        var sql = `UPDATE BBS SET READ_COUNT=READ_COUNT + 1 WHERE NO=${req.query.brdno}`;
        connection.execute(sql, function (err, rows) {
            if (err) console.error(`err : ${err}`);
            connection.release();
        });
    });

    var isLoggedIn = false; // 로그인 판단
    var id = null; // 글 작성자 id
    if (req.session.user) {
        isLoggedIn = true;
        id = req.session.user.id;
    }

    oracledb.getConnection(dbconfig, function (err, connection) {
        var sql = `SELECT NO, TITLE, CONTENT, WRITER, to_char(REGDATE,'yyyy-mm-dd hh24:mi:ss'), READ_COUNT, ID, FILENAME FROM BBS WHERE NO=${req.query.brdno}`;

        connection.execute(sql, function (err, rows) {
            if (err) console.error(`err : ${err}`);

            res.render("bbs/read", {rows: rows.rows, id: id, isLoggedIn: isLoggedIn});  // id와 로그인유무를 보내 수정, 삭제 권한 기능
            connection.release();
        });
    });
});

router.get("/form", function (req, res, next) {  // 글 수정 및 작성 기능
    var userId = req.session.user;
    if (userId) {
        if (!req.query.brdno) {
            res.render("bbs/form", {rows: "", name: userId.name});
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

router.post("/save", upload.single("image"), function (req, res, next) {
    if (req.session.user) {
        oracledb.getConnection(dbconfig, function (err, connection) {
            if (req.body.brdno) {
                var sql = `UPDATE BBS SET TITLE='${req.body.brdtitle}', CONTENT='${req.body.brdmemo}', WRITER='${req.body.brdwriter}' WHERE NO=${req.body.brdno}`;  // brdno가 있을때는 글 수정
            } else {
                if (req.file) {
                    var fileName = req.file.filename;
                    var filePath = `files/${fileName}`;

                    var sql = `INSERT INTO BBS(NO, TITLE, CONTENT, WRITER, REGDATE, ID, FIlENAME, FILEPATH) VALUES(bbs_seq.nextval, '${req.body.brdtitle}', '${req.body.brdmemo}', '${req.body.brdwriter}', sysdate, '${req.session.user.id}', '${fileName}', '${filePath}')`;  // req.file이 있을때 filename, filepath 저장
                    console.log(sql)
                } else {
                    var sql = `INSERT INTO BBS(NO, TITLE, CONTENT, WRITER, REGDATE, ID) VALUES(bbs_seq.nextval, '${req.body.brdtitle}', '${req.body.brdmemo}', '${req.body.brdwriter}', sysdate, '${req.session.user.id}')`;
                }
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

router.get("/delete", function (req, res, next) { // 글 삭제 기능
    oracledb.getConnection(dbconfig, function (err, connection) {
        var sql = `DELETE FROM BBS WHERE NO=${req.query.brdno}`;

        connection.execute(sql, function (err, rows) {
            if (err) console.error(`err : ${err}`);

            res.redirect("/bbs/list");
            connection.release();
        });
    })
});

router.get("/wlist", function (req, res, next) { // 댓글 목록
    var isLoggedIn = false;
    var name = null;
    var id = null;
    if (req.session.user) {
        isLoggedIn = true;
        name = req.session.user.name
    }

    oracledb.getConnection(dbconfig, function (err, connection) {
        var sql = `SELECT NO, BBS_NO, WRITER, CONTENT, to_char(REGDATE,'yyyy-mm-dd hh24:mi:ss'), ID FROM BBSW WHERE BBS_NO=${req.query.bbs_no} ORDER BY NO ASC`;
        connection.execute(sql, function (err, rows) {
            if (err) console.error(`err : ${err}`);

            var brdNo = req.query.bbs_no;
            res.render("bbs/write", {rows:rows, brdNo:brdNo, isLoggedIn: isLoggedIn, name: name, id: id}); // 로그인 유무, id로 댓글 수정, 삭제 권한 판단, 댓글 작성 시 name 자동 기입
            connection.release();
        });
    });
});

router.post("/write", function (req, res, next) {  // 댓글 작성 기능
    oracledb.getConnection(dbconfig, function (err, connection) {
        if (req.body.brdno1) {  // brd.no1가 있다면 댓글 수정 기능
            var sql = `UPDATE BBSW SET WRITER='${req.body.brdwriter1}', CONTENT='${req.body.brdmemo1}' WHERE NO=${req.body.brdno1}`;
        } else {
            var sql = `INSERT INTO BBSW(NO, BBS_NO, WRITER, CONTENT, ID) VALUES(bbsw_seq.nextval, '${req.body.bbs_no}', '${req.body.brdwriter1}', '${req.body.brdmemo1}', '${req.session.user.id}')`;
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

router.get("/wdelete", function (req, res, next) {  // 댓글 삭제 기능
    oracledb.getConnection(dbconfig, function (err, connection) {
        var sql = `DELETE FROM BBSW WHERE NO=${req.query.brdno1}`;

        connection.execute(sql, function (err, rows) {
            if (err) console.error(`err : ${err}`);

            res.redirect(`/bbs/wlist?bbs_no=${req.query.bbs_no}`);
            connection.release();
        });
    });
});

router.get("/search", function (req, res, next) {  // 검색 기능
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

router.get("/signup", function (req, res, next) { // 회원가입 페이지
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
    if (id.length < 4) {  // id가 4글자 이상이지 않을때
        return res.render("bbs/signup", {errcode: 2});
    }
    if (pw !== password_check || pw.length == 0) {  // 패스워드와 패스워드 확인 문자열이 다를때, 패스워드가 빈값일때
        return res.render("bbs/signup", {errcode: 3});
    }
    if (!name) {  // name이 빈값일때
        return res.render("bbs/signup", {errcode: 4});
    }

    var salt = Math.round(new Date().valueOf()*Math.random()) + "";  // salt 생성
    var hashPassword = crypto.createHash("sha512").update(pw+salt).digest("base64");  // 암호화된 패스워드

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
        var sql = `SELECT OK, PASSWORD, SALT, NAME FROM LOGIN WHERE ID = '${id}'`;

        connection.execute(sql, function(err, results) {
            if (err) console.error(`err : ${err}`);

            if (results.rows.length < 1) {
                console.log("로그인 아이디가 없습니다!");
                code = 1;
                res.render("bbs/login", {errcode: code});
                return;
            } else {
                var dbhashPassword = results.rows[0][1];  // db에 저장된 패스워드
                var salt = results.rows[0][2];  // db에 저장된 salt
                var hashPassword = crypto.createHash("sha512").update(pw+salt).digest("base64");  // 암호화된 패스워드

                if (dbhashPassword == hashPassword) {  // db에 저장된 패스워드와 암호화된 패스워드 비교
                    const paramID = req.body.id || req.query.id;
                    const pwd = req.body.password || req.query.password;

                    req.session.user = { // session에 id, pwd, name, authorized 추가
                        id: paramID,
                        pwd: pwd,
                        name: results.rows[0][3],
                        authorized: true
                    };
                } else {
                    code = 2;
                    res.render("bbs/login", {errcode:code});
                    return ;
                }
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
            res.render("bbs/updateUser", {  // 회원정보 수정 시 기존 id, name, email을 표시
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
    if (pw !== password_check || pw.length == 0) {  // 패스워드와 패스워드 확인 값 비교, 패스워드 빈값인지 확인
        return res.render("bbs/updateUser", {
            errcode: 3,
            id: id,
            name: name,
            email: email
        });
    }
    if (!name) {  // name이 빈값인지 확인
        return res.render("bbs/updateUser", {
            errcode: 4,
            id: id,
            name: name,
            email: email
        });
    }
    var salt = Math.round(new Date().valueOf()*Math.random()) + "";  // salt
    var hashPassword = crypto.createHash("sha512").update(pw+salt).digest("base64");  // 암호화된 패스워드

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
        req.session.destroy(()=>{  // 로그아웃 시 세션 삭제
            res.redirect("/bbs/list");
        });
    }
})

router.get("/resign", function (req, res, next) {
    id = req.session.user.id;
    if (req.session) {
        req.session.destroy(()=>{  // 회원탈퇴시 세션 삭제
        });
    }
    oracledb.getConnection(dbconfig, function (err, connection) {  // db에서 회원정보 삭제
        var sql = `DELETE FROM LOGIN WHERE ID='${id}'`;
        connection.execute(sql, function (err, rows) {
            if (err) console.error(`err : ${err}`);

            res.redirect("/bbs/list");
            connection.release();
        });
    });
})

module.exports = router;
