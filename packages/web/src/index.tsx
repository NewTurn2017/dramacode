import { render } from "solid-js/web"
import { Router, Route } from "@solidjs/router"
import App from "./app"
import { routes, hiddenRoutes } from "./routes"
import "./index.css"

const allRoutes = [...routes, ...hiddenRoutes]

render(
  () => (
    <Router root={App}>
      {allRoutes.map((r) => (
        <Route path={r.path} component={r.component} />
      ))}
    </Router>
  ),
  document.getElementById("root")!,
)
