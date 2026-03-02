from flask import Flask, render_template, request, redirect, url_for, session
from flask_bcrypt import Bcrypt

app = Flask(__name__)
app.secret_key = "supersecretkey"

bcrypt = Bcrypt(app)

users = {
    "admin": bcrypt.generate_password_hash("admin").decode("utf-8")
}


@app.route("/")
def index():
    if "user" in session:
        return redirect(url_for("dashboard"))
    return redirect(url_for("login"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if "user" in session:
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")

        if username in users and bcrypt.check_password_hash(users[username], password):
            session["user"] = username
            return redirect(url_for("dashboard"))

        return render_template("login.html", error="Invalid username or password")

    return render_template("login.html", error=None)


@app.route("/dashboard")
def dashboard():
    if "user" not in session:
        return redirect(url_for("login"))

    return render_template("dashboard.html", username=session["user"])


@app.route("/logout")
def logout():
    session.pop("user", None)
    return redirect(url_for("login"))


if __name__ == "__main__":
    app.run(debug=True)
