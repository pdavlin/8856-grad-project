import { serve } from "https://deno.land/std@0.147.0/http/server.ts";
import { CouchClient } from "./couch.ts";
import { employeeInput, companyInput, worksInput } from "./input.ts";

serve(handler, { port: 80 });

// define types of data, for safety.

type Employee = {
  firstName: string;
  lastName: string;
  middleInitial: string;
  street: string;
  city: string;
  gender: string;
};

type Company = {
  companyName: string;
  city: string;
};

type Works = {
  firstName: string;
  lastName: string;
  middleInitial: string;
  companyName: string;
  salary: number;
};

type EmploymentInfo = {
  type: "employee" | "company" | "works";
  data: Employee | Company | Works;
};

// establish connection to database.
// This isn't very secure but the db is proxied from the host system, so should be *relatively* safe.
const couch = new CouchClient("http://couch:5984", {
  basicAuth: { username: "admin", password: "secret" },
});

// Handle incoming requests based on path.
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  console.log(`${req.method} ${url.pathname}`);
  if (url.pathname === "/v1/couch/separate/create") {
    return createTables();
  } else if (url.pathname === "/v1/couch/separate/insert") {
    return await insertData();
  } else if (url.pathname === "/v1/couch/separate/q1") {
    return await q1();
  } else if (url.pathname === "/v1/couch/separate/q2") {
    return await q2();
  } else if (url.pathname === "/v1/couch/combined/create") {
    return combinedCreateTables();
  } else if (url.pathname === "/v1/couch/combined/insert") {
    return await combinedInsertData();
  } else if (url.pathname === "/v1/couch/combined/q1") {
    return await combinedQ1();
  } else if (url.pathname === "/v1/couch/combined/q2") {
    return await combinedQ2();
  } else {
    return new Response(
      JSON.stringify({ statusCode: 404, message: "NOT FOUND" }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }
    );
  }
}

// Create a single table to hold all objects.
async function createTables() {
  let response = "";
  await ["employment"].forEach(async (tableName) => {
    if (!(await couch.databaseExists(tableName))) {
      couch.createDatabase(tableName).catch((error) => {
        console.error(error);
      });
    }
  });
  return new Response(JSON.stringify({ statusCode: 200, result: response }), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

// insert three different tpes of data based on input type.
async function insertData() {
  let db = couch.database<EmploymentInfo>("employment");
  for (let input of employeeInput) {
    const result = await db.insert({
      type: "employee",
      data: input,
    });
    console.log(result);
  }
  for (let input of companyInput) {
    const result = await db.insert({
      type: "company",
      data: input,
    });
    console.log(result);
  }
  for (let input of worksInput) {
    const result = await db.insert({
      type: "works",
      data: input,
    });
    console.log(result);
  }
  return new Response(JSON.stringify({ statusCode: 200, result: "" }), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

/**
 * Perform functions on data view by hand to get results of query 1.
 * @returns Response()
 */
async function q1() {
  const db = couch.database<EmploymentInfo>("employment");
  const empLnk = parseResults(await db.getView("employees", "employees-lnk"));
  const companyOma = parseResults(await db.getView("companies", "company-oma"));
  const works = parseResults(await db.getView("works", "all-works"));

  const results = works
    .filter(
      (job) =>
        empLnk.includes(job.lastName) && companyOma.includes(job.companyName)
    )
    .map((job) => `${job.firstName} ${job.middleInitial}. ${job.lastName}`);

  // const output = employeesLnk.keys().map()
  return new Response(
    JSON.stringify({
      statusCode: 200,
      task: "Find the name of an employee who lives in Lincoln and works in Omaha.",
      result: JSON.parse(JSON.stringify({ results })),
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    }
  );
}

/**
 * Perform functions on data view by hand to get results of query 2.
 * @returns Response()
 */
async function q2() {
  const db = couch.database<EmploymentInfo>("employment");
  const emps = parseResults(await db.getView("employees", "employee-lives"));
  const comps = parseResults(await db.getView("companies", "company-locs"));
  const works = parseResults(await db.getView("works", "all-works"));

  const results = works
    .map((job) => ({
      firstName: job.firstName,
      lastName: job.lastName,
      middleInitial: job.middleInitial,
      salary: job.salary,
      companyCity: comps.filter(
        (comp) => job.companyName === comp.companyName
      )[0].city,
      livesCity: emps.filter((emp) => job.lastName === emp.lastName)[0].city,
    }))
    .filter((job) => job.companyCity === job.livesCity)
    .map((job) => job.salary);

  return new Response(
    JSON.stringify({
      statusCode: 200,
      task: "Find salaries of employees who live in the same cities as the companies for which they work.",
      result: JSON.parse(JSON.stringify({ results })),
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    }
  );
}

/**
 * Helper function to parse results from the HTTP response.
 * @param response HTTP response from CouchDB.
 * @returns key values from response.
 */
function parseResults(response) {
  return response.rows.map((row) => row.key);
}


async function combinedCreateTables() {
  let response = "";
  await ["employment-combined"].forEach(async (tableName) => {
    if (!(await couch.databaseExists(tableName))) {
      couch.createDatabase(tableName).catch((error) => {
        console.log("oof");
        console.error(error);
      });
    }
  });
  return new Response(JSON.stringify({ statusCode: 200, result: response }), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

async function combinedInsertData() {
  let db = couch.database<EmploymentInfo>("employment-combined");
  for (let input of employeeInput) {
    const result = await db.insert(input);
  }
  // find any locations where employee already exists, and update those rows.
  for (let input of worksInput) {
    console.log(`finding ${input.lastName}`);
    const { id, rev, record } = parseKVResults(
      await db.getView("employment", "by-name", input.lastName)
    );
    record.companyName = input.companyName;
    record.salary = input.salary;
    await db.put(id, record, { rev });
  }
  // find any locations where company name already exists, and update those rows.
  for (let input of companyInput) {
    console.log(`finding ${input.companyName}`);
    const { rows } = await db.getView(
      "employment",
      "by-company",
      input.companyName
    );
    console.log(rows.length);
    rows.forEach(async ({ value }) => {
      const { id, rev, record } = value;
      record.companyCity = input.city;
      await db.put(id, record, { rev });
    });
  }
  return new Response(JSON.stringify({ statusCode: 200, result: "" }), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

/**
 * Helper function to parse broader results from the HTTP response.
 * @param response HTTP response from CouchDB.
 * @returns key values from response.
 */
function parseKVResults(response) {
  return response.rows[0].value;
}

async function combinedQ1() {
  const db = couch.database<EmploymentInfo>("employment-combined");
  const response = await db.getView("queries", "query-1");

  const results = response.rows.map((row) => row.value);
  return new Response(
    JSON.stringify({
      statusCode: 200,
      task: "Find the name of an employee who lives in Lincoln and works in Omaha.",
      results: JSON.parse(JSON.stringify({ results })),
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    }
  );
}

async function combinedQ2() {
  const db = couch.database<EmploymentInfo>("employment-combined");
  const response = await db.getView("queries", "query-2");

  const results = response.rows.map((row) => row.value);
  return new Response(
    JSON.stringify({
      statusCode: 200,
      task: "Find salaries of employees who live in the same cities as the companies for which they work.",
      results: JSON.parse(JSON.stringify({ results })),
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    }
  );
}
