async function handleGoogleLogin(googleUser) {
  const decoded = jwt_decode(googleUser.credential);

  const user = {
    email: decoded.email,
    name: decoded.name,
    picture: decoded.picture || null
  };

  localStorage.setItem("user", JSON.stringify(user));

  const res = await fetch(
    `/api/profile?email=${encodeURIComponent(user.email)}`
  );
  const profile = await res.json();

  window.location.href = profile ? "/builder" : "/profile";
}


function logout() {
      localStorage.removeItem("user");
      localStorage.removeItem("profile");
      window.location.href = "/";
    }