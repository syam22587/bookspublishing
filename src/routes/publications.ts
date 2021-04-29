import { Router } from "express";
import { db } from "../database";

db.get("PRAGMA foreign_keys = ON");

declare interface PublicationSqlResponse {
  Id: number;
  Title: string;
  PublishYear: number;
  AuthorName: string;
  AuthorId: number;
}

declare interface PublicationApiResponse {
  Id: number;
  Title: string;
  PublishYear: number;
  Authors: { Name: string; Id: number }[];
}

declare interface PublicationApiPayload {
  title: string;
  PublishYear: number;
  AuthorIds: number[];
}

function insertPublication(obj) {
  const { title, publish_year } = obj;

  return new Promise((resolve, reject) => {
    const query = `INSERT INTO Publications ( Title, PublishYear) VALUES ( "${title}", ${publish_year} )`;
    db.run(query, function (error) {
      if (error) {
        reject({ error: "Error inserting the publication " });
      } else {
        resolve(this.lastID);
      }
    });
  });
}

function insertAuthorPublications(author_ids, publicationId) {
  console.log("author_ids, publicationId", author_ids, publicationId);
  let x = 0;
  return new Promise((resolve, reject) => {
    for (let index = 0; index < author_ids.length; index++) {
      const query = `INSERT INTO AuthorPublications
      (  AuthorId, PublicationId) VALUES (${author_ids[index]}, ${publicationId})`;

      db.run(query, function (err) {
        if (err) {
          console.log(
            "Error finding the author details with " + author_ids[index] + " id"
          );
          reject({
            error:
              "Error finding the author details with " +
              author_ids[index] +
              " id",
          });
          return;
        } else {
          x++;
          console.log(" created record ", this.lastID);
          if (x === author_ids.length) resolve("Successfully created records ");
        }
      });
    }
  });
}

function retrieveInsertedrecords(publicationId) {
  return new Promise((resolve, reject) => {
    let queryStr = `SELECT PUB.*, AUTH.Name as 'AuthorName', AUTH.Id as 'AuthorId' FROM Publications PUB
                    INNER JOIN AuthorPublications AP ON AP.PublicationId=PUB.Id
                    INNER JOIN Authors AUTH ON AUTH.Id=AP.AuthorId`;

    if (publicationId) {
      queryStr += ` WHERE PUB.Id=${publicationId}`;
    } else {
      queryStr += ";";
    }

    db.all(queryStr, (err, rows: PublicationSqlResponse[]) => {
      if (rows) {
        console.log(" all publs ", rows);
        const dataResp = rows.reduce((prev, curr) => {
          const idx = prev.findIndex((p) => p.Id === curr.Id);
          if (idx > -1) {
            prev[idx].Authors.push({
              Name: curr.AuthorName,
              Id: curr.AuthorId,
            });
          } else {
            prev.push({
              Id: curr.Id,
              Title: curr.Title,
              PublishYear: curr.PublishYear,
              Authors: [{ Name: curr.AuthorName, Id: curr.AuthorId }],
            });
          }
          return prev;
        }, [] as PublicationApiResponse[]);
        resolve(dataResp.length > 0 ? dataResp[0] : "");
        // res.status(200).json(dataResp);
      } else {
        reject({ error: "Error retrieving id " });
      }
    });
  });
}

export function configurePublicationRoutes(router: Router) {
  router.get<null, PublicationApiResponse[], null, { publishYear: string }>(
    "/",
    async (req, res) => {
      // console.log(" received req ,res ", req, res);
      let queryStr = `SELECT PUB.*, AUTH.Name as 'AuthorName', AUTH.Id as 'AuthorId' FROM Publications PUB
                    INNER JOIN AuthorPublications AP ON AP.PublicationId=PUB.Id
                    INNER JOIN Authors AUTH ON AUTH.Id=AP.AuthorId`;

      if (req.query.publishYear) {
        queryStr += ` WHERE PUB.PublishYear=${req.query.publishYear}`;
      } else {
        queryStr += ";";
      }

      db.all(queryStr, (err, rows: PublicationSqlResponse[]) => {
        if (rows) {
          console.log(" all publs ", rows);
          const dataResp = rows.reduce((prev, curr) => {
            const idx = prev.findIndex((p) => p.Id === curr.Id);
            if (idx > -1) {
              prev[idx].Authors.push({
                Name: curr.AuthorName,
                Id: curr.AuthorId,
              });
            } else {
              prev.push({
                Id: curr.Id,
                Title: curr.Title,
                PublishYear: curr.PublishYear,
                Authors: [{ Name: curr.AuthorName, Id: curr.AuthorId }],
              });
            }
            return prev;
          }, [] as PublicationApiResponse[]);
          res.status(200).json(dataResp);
        } else {
          return res.status(400).send();
        }
      });
    }
  );

  router.post("/newlink", (req, res) => {
    const { title, publish_year, author_ids } = req.body;

    db.serialize(async () => {
      db.run("BEGIN");
      try {
        db.get("PRAGMA foreign_keys = ON");

        let publicationId = await insertPublication(req.body);
        console.log(" received promist ", publicationId);

        let obj2 = await insertAuthorPublications(author_ids, publicationId);

        if (obj2) {
          db.run("COMMIT");

          let dataResp = await retrieveInsertedrecords(publicationId);
          return res.status(200).send(dataResp);
        }
      } catch (error) {
        db.run("ROLLBACK");
        console.log("erro ", error);
        return res.status(400).send(error.error);
      }
    });

    // console.log(" received promist ", obj);
  });

  router.post("/", async (req, res) => {
    db.get("PRAGMA foreign_keys = ON");
    console.log("printing  , req ", req.body);

    const { title, publish_year, author_ids } = req.body;

    /**
     *  1. Validate the payload data
     *  2. Start tranaction
     *  3. insert the data into Publications
     *  4. insert the data into AuthorPublications
     *  5. if success send 200 message to end users
     *  6. if error send 400 bad request with some message
     */

    let pubId: any;
    const query = `INSERT INTO Publications ( Title, PublishYear) VALUES ( "${title}", ${publish_year} )`;
    await db.run(query, function (err) {
      let hasErrorOccured = false;

      if (err) {
        console.log("Error in inserting the publication ", err);
        hasErrorOccured = true;
        // res.status(400).send().end();
        // return;
      } else {
        pubId = this.lastID;
        console.log(" inner console ", pubId);
        for (let i = 0; i < author_ids.length; i++) {
          // console.log("inserting values ", author_ids[i], pubId);
          const query = `INSERT INTO AuthorPublications
                          (  AuthorId, PublicationId) VALUES (${author_ids[i]}, ${pubId})`;
          db.run(query, function (err) {
            if (err) {
              console.log(" erro ", err);
              hasErrorOccured = true;

              // res.status(400).send().end();
              // return;
            } else {
              console.log(
                " author_ids[i] ,  pubId ,  this.lastID) ",
                author_ids[i],
                pubId,
                this.lastID
              );
            }
          });
        }
        ///////////////////////////////

        if (hasErrorOccured) {
          res.status(400).send().end();
          return;
        } else {
          let queryStr = `SELECT PUB.*, AUTH.Name as 'AuthorName', AUTH.Id as 'AuthorId' FROM Publications PUB
          INNER JOIN AuthorPublications AP ON AP.PublicationId=PUB.Id
          INNER JOIN Authors AUTH ON AUTH.Id=AP.AuthorId`;

          if (pubId) {
            queryStr += ` WHERE PUB.Id=${pubId}`;
          } else {
            queryStr += ";";
          }

          db.all(queryStr, (err, rows: PublicationSqlResponse[]) => {
            if (rows) {
              console.log(" all publs ", rows);
              const dataResp = rows.reduce((prev, curr) => {
                const idx = prev.findIndex((p) => p.Id === curr.Id);
                if (idx > -1) {
                  prev[idx].Authors.push({
                    Name: curr.AuthorName,
                    Id: curr.AuthorId,
                  });
                } else {
                  prev.push({
                    Id: curr.Id,
                    Title: curr.Title,
                    PublishYear: curr.PublishYear,
                    Authors: [{ Name: curr.AuthorName, Id: curr.AuthorId }],
                  });
                }
                return prev;
              }, [] as PublicationApiResponse[]);
              res.status(200).json(dataResp.length > 0 ? dataResp[0] : "");
            } else {
              res.status(400).send();
            }
          });
        }
      }
    });
  });

  router.get("/getpubs", (req, res) => {
    // const query = `INSERT INTO Publications (Id, Title, PublishYear) VALUES ( 501, "syam navala", 2000 )`;
    // let result = db.run(query, function (err) {
    //   if (err) console.log("there is a error", err);
    //   console.log(" this this this ", this.lastID);
    // });
    // console.log(" retrieved result ", result);

    const qr1 = "SELECT * FROM Publications order by id desc LIMIT 1  ";
    db.all(qr1, (err, rows: Number) => {
      console.log("retrieved max is ", rows);
    });

    const qr2 = "select * from  AuthorPublications order by id desc limit 5 ";
    db.all(qr2, (err, rows: Number) => {
      console.log("retrieved max  authpublications ", rows);
    });

    return res.status(200).json({ xyz: "abc" });
  });
}
