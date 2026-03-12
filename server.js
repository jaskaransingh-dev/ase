export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({
          error: "Valid email required",
          code: "MISSING_EMAIL"
        }),
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return new Response(
        JSON.stringify({
          error: "Invalid email format",
          code: "INVALID_EMAIL"
        }),
        { status: 400 }
      );
    }

    // insert into D1
    const result = await env.DB.prepare(
      `INSERT INTO waitlist_users (email) VALUES (?)`
    )
      .bind(trimmedEmail)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        email: trimmedEmail,
        id: result.meta.last_row_id
      }),
      { status: 200 }
    );

  } catch (err) {

    // duplicate email
    if (err.message && err.message.includes("UNIQUE")) {
      return new Response(
        JSON.stringify({
          error: "Email already in waitlist",
          code: "DUPLICATE_EMAIL"
        }),
        { status: 409 }
      );
    }

    return new Response(
      JSON.stringify({
        error: "Server error",
        details: err.message
      }),
      { status: 500 }
    );
  }
}