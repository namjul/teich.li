import { registerSW } from "virtual:pwa-register";
import { render } from "solid-js/web";
import { App } from "./App";
import "./styles.css";

registerSW({ immediate: true });

render(() => <App />, document.getElementById("app") as HTMLElement);
