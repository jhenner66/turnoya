package com.tienda.turnoya;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.KeyEvent;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {

    /* [ETIQUETA: CONSTANTES Y REFERENCIAS DE INTERFAZ ANDROID] */
    private static final String PREFS = "turnoya";
    private static final String KEY_URL = "server_url";
    private static final String URL_POR_DEFECTO = "https://turnoya-phi.vercel.app";
    private static final String PUERTO_POR_DEFECTO = "3000";
    private static final int REQ_ALMACENAMIENTO = 1001;

    private WebView webView;
    private View setupView;
    private View errorOverlay;
    private EditText urlInput;
    private TextView errorView;
    private TextView errorMessage;
    private ProgressBar progressBar;
    private SharedPreferences prefs;

    private String urlActual;
    private boolean errorMostrado;

    private String descargaPendienteUrl;
    private String descargaPendienteNombre;
    private String descargaPendienteMime;

    /* [ETIQUETA: CICLO DE VIDA E INICIALIZACIÓN DE LA APP ANDROID] */
    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        webView = findViewById(R.id.webview);
        setupView = findViewById(R.id.setup);
        errorOverlay = findViewById(R.id.error_overlay);
        urlInput = findViewById(R.id.input_url);
        errorView = findViewById(R.id.setup_error);
        errorMessage = findViewById(R.id.error_message);
        progressBar = findViewById(R.id.progress);

        configurarWebView();
        configurarFormulario();
        mostrarVersion();

        boolean depurable =
            (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (depurable) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        String guardada = prefs.getString(KEY_URL, null);
        if (guardada == null || guardada.trim().isEmpty()) {
            // Primera apertura: muestra la pantalla para pegar el enlace y elegir modo
            urlInput.setText(URL_POR_DEFECTO);
            mostrarSetup(null);
        } else {
            urlInput.setText(guardada);
            cargarServidor(guardada);
        }
    }

    private void configurarFormulario() {
        Button conectar = findViewById(R.id.btn_conectar);
        conectar.setOnClickListener(v -> conectarDesdeFormulario(false));
        Button conectarColab = findViewById(R.id.btn_conectar_colaborador);
        if (conectarColab != null) {
            conectarColab.setOnClickListener(v -> conectarDesdeFormulario(true));
        }
        urlInput.setOnEditorActionListener((v, actionId, event) -> {
            boolean enter = event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER;
            if (actionId == EditorInfo.IME_ACTION_GO || actionId == EditorInfo.IME_ACTION_DONE || enter) {
                conectarDesdeFormulario(false);
                return true;
            }
            return false;
        });

        Button reintentar = findViewById(R.id.btn_reintentar);
        reintentar.setOnClickListener(v -> reintentarCarga());
        Button cambiar = findViewById(R.id.btn_cambiar_servidor);
        cambiar.setOnClickListener(v -> mostrarSetup(null));
    }

    private void mostrarVersion() {
        TextView version = findViewById(R.id.setup_version);
        if (version == null) return;
        try {
            String nombre = getPackageManager()
                .getPackageInfo(getPackageName(), 0).versionName;
            version.setText(getString(R.string.version_label, nombre));
        } catch (Exception e) {
            version.setText("");
        }
    }

    /* [ETIQUETA: CONFIGURACIÓN DEL WEBVIEW Y CACHÉ OFFLINE] */
    private void configurarWebView() {
        WebSettings ajustes = webView.getSettings();
        ajustes.setJavaScriptEnabled(true);
        ajustes.setDomStorageEnabled(true);
        ajustes.setDatabaseEnabled(true);
        ajustes.setUseWideViewPort(true);
        ajustes.setLoadWithOverviewMode(true);
        ajustes.setSupportZoom(false);
        ajustes.setBuiltInZoomControls(false);
        ajustes.setDisplayZoomControls(false);
        ajustes.setMediaPlaybackRequiresUserGesture(true);
        ajustes.setCacheMode(WebSettings.LOAD_DEFAULT);
        ajustes.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        ajustes.setSupportMultipleWindows(false);
        ajustes.setJavaScriptCanOpenWindowsAutomatically(false);
        ajustes.setAllowFileAccess(false);
        ajustes.setAllowContentAccess(false);
        ajustes.setSaveFormData(false);
        ajustes.setUserAgentString(ajustes.getUserAgentString() + " TurnoYa/1.2");

        CookieManager.getInstance().setAcceptCookie(true);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int progreso) {
                progressBar.setProgress(progreso);
                progressBar.setVisibility(progreso < 100 ? View.VISIBLE : View.GONE);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                if (!errorMostrado) {
                    progressBar.setProgress(0);
                    progressBar.setVisibility(View.VISIBLE);
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                if (!errorMostrado) {
                    errorOverlay.setVisibility(View.GONE);
                    webView.setVisibility(View.VISIBLE);
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    mostrarError(getString(R.string.error_connect));
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request,
                                            android.webkit.WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) {
                    mostrarError(getString(R.string.error_http, response.getStatusCode()));
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return manejarEnlace(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return manejarEnlace(Uri.parse(url));
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimeType, long contentLength) {
                solicitarDescarga(url, contentDisposition, mimeType);
            }
        });
    }

    /* [ETIQUETA: GESTIÓN DE CONEXIÓN, ENLACES INTERNOS Y ERRORES] */

    private void conectarDesdeFormulario(boolean modoColaborador) {
        String normalizada = normalizarUrl(urlInput.getText().toString());
        if (normalizada == null) {
            errorView.setText(R.string.error_url);
            errorView.setVisibility(View.VISIBLE);
            return;
        }

        if (modoColaborador && !normalizada.endsWith("/mi-turno")) {
            normalizada = urlRaiz(normalizada) + "/mi-turno";
        } else if (!modoColaborador && normalizada.endsWith("/mi-turno")) {
            // Si escribió explícitamente /mi-turno y tocó conectar, se respeta,
            // salvo que use el botón de Administrador sobre la raíz.
        }

        prefs.edit().putString(KEY_URL, normalizada).apply();
        urlInput.setText(normalizada);
        errorView.setVisibility(View.GONE);
        cargarServidor(normalizada);
    }

    private String urlRaiz(String url) {
        try {
            Uri uri = Uri.parse(url);
            String esquema = uri.getScheme() == null ? "https" : uri.getScheme();
            String autoridad = uri.getAuthority();
            if (autoridad != null) {
                return esquema + "://" + autoridad;
            }
        } catch (Exception ignored) {
        }
        return url.replaceAll("/mi-turno/?$", "");
    }

    private void cargarServidor(String url) {
        urlActual = url;
        setupView.setVisibility(View.GONE);
        errorOverlay.setVisibility(View.GONE);
        errorMostrado = false;
        webView.setVisibility(View.VISIBLE);
        invalidateOptionsMenu();
        actualizarSubtitulo();

        webView.getSettings().setCacheMode(
            hayRed() ? WebSettings.LOAD_DEFAULT : WebSettings.LOAD_CACHE_ELSE_NETWORK
        );

        progressBar.setProgress(0);
        progressBar.setVisibility(View.VISIBLE);
        webView.loadUrl(url);
    }

    private void reintentarCarga() {
        if (urlActual == null || urlActual.isEmpty()) {
            mostrarSetup(null);
            return;
        }

        errorOverlay.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        errorMostrado = false;
        invalidateOptionsMenu();
        cargarServidor(urlActual);
    }

    private void mostrarError(String mensaje) {
        errorMostrado = true;
        progressBar.setVisibility(View.GONE);
        errorMessage.setText(mensaje);
        errorOverlay.setVisibility(View.VISIBLE);
        webView.setVisibility(View.INVISIBLE);
        invalidateOptionsMenu();
    }

    private void mostrarSetup(String mensaje) {
        webView.stopLoading();
        webView.setVisibility(View.GONE);
        errorOverlay.setVisibility(View.GONE);
        progressBar.setVisibility(View.GONE);
        setupView.setVisibility(View.VISIBLE);
        errorMostrado = false;
        urlActual = null;
        actualizarSubtitulo();

        String guardada = prefs.getString(KEY_URL, null);
        if (guardada != null && !guardada.isEmpty()) {
            urlInput.setText(guardada);
        } else if (urlInput.getText().toString().trim().isEmpty()) {
            urlInput.setText(URL_POR_DEFECTO);
        }

        if (mensaje != null && !mensaje.isEmpty()) {
            errorView.setText(mensaje);
            errorView.setVisibility(View.VISIBLE);
        } else {
            errorView.setVisibility(View.GONE);
        }

        invalidateOptionsMenu();
    }

    private void actualizarSubtitulo() {
        if (getActionBar() == null) return;

        String subtitulo = getString(R.string.app_subtitle);
        if (urlActual != null) {
            try {
                Uri uri = Uri.parse(urlActual);
                String host = uri.getHost();
                if (host != null && !host.isEmpty()) {
                    subtitulo = uri.getPort() == -1 ? host : host + ":" + uri.getPort();
                }
            } catch (Exception ignored) {
                /* se queda con el subtítulo por defecto */
            }
        }
        getActionBar().setSubtitle(subtitulo);
    }

    private boolean hayRed() {
        ConnectivityManager gestor =
            (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (gestor == null) return true;

        android.net.Network red = gestor.getActiveNetwork();
        if (red == null) return false;

        NetworkCapabilities capacidades = gestor.getNetworkCapabilities(red);
        return capacidades != null
            && capacidades.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    private boolean manejarEnlace(Uri uri) {
        String esquema = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();

        if (esquema.equals("http") || esquema.equals("https")) {
            return false; // siempre abre dentro de la app sin usar el navegador externo
        }

        if (esquema.equals("mailto") || esquema.equals("tel")
                || esquema.equals("sms") || esquema.equals("whatsapp")
                || esquema.equals("intent")) {
            abrirExterno(uri);
            return true;
        }

        return true; // bloquea esquemas desconocidos
    }

    private void abrirExterno(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception e) {
            Toast.makeText(this, R.string.external_link_error, Toast.LENGTH_SHORT).show();
        }
    }

    private String normalizarUrl(String texto) {
        String valor = texto == null ? "" : texto.trim();
        if (valor.isEmpty()) return null;

        if (!valor.matches("(?i)^https?://.*")) {
            valor = "http://" + valor;
        }

        Uri uri;
        try {
            uri = Uri.parse(valor);
        } catch (Exception e) {
            return null;
        }

        String host = uri.getHost();
        if (host == null || host.isEmpty()) return null;

        String esquema = uri.getScheme() == null ? "http" : uri.getScheme().toLowerCase();
        if (!esquema.equals("http") && !esquema.equals("https")) return null;

        Uri.Builder constructor = uri.buildUpon().scheme(esquema);
        if (uri.getPort() == -1 && esquema.equals("http")) {
            constructor.authority(host + ":" + PUERTO_POR_DEFECTO);
        }

        String resultado = constructor.build().toString();
        while (resultado.endsWith("/") && resultado.length() > esquema.length() + 3) {
            resultado = resultado.substring(0, resultado.length() - 1);
        }
        return resultado;
    }

    /* [ETIQUETA: DESCARGA DE REPORTES EXCEL Y PERMISOS DE ALMACENAMIENTO] */

    private void solicitarDescarga(String url, String contentDisposition, String mimeType) {
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
            descargaPendienteUrl = url;
            descargaPendienteNombre = URLUtil.guessFileName(url, contentDisposition, mimeType);
            descargaPendienteMime = mimeType;
            requestPermissions(
                new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE},
                REQ_ALMACENAMIENTO
            );
            return;
        }
        descargar(url, contentDisposition, mimeType);
    }

    private void descargar(String url, String contentDisposition, String mimeType) {
        try {
            String nombre = URLUtil.guessFileName(url, contentDisposition, mimeType);
            DownloadManager.Request solicitud = new DownloadManager.Request(Uri.parse(url));
            solicitud.setMimeType(mimeType);
            solicitud.setTitle(nombre);
            solicitud.setDescription(getString(R.string.download_started));
            solicitud.setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
            );
            solicitud.allowScanningByMediaScanner();
            solicitud.setDestinationInExternalPublicDir(
                Environment.DIRECTORY_DOWNLOADS,
                nombre
            );

            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) {
                solicitud.addRequestHeader("Cookie", cookies);
            }
            solicitud.addRequestHeader("User-Agent", webView.getSettings().getUserAgentString());

            DownloadManager gestor =
                (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (gestor == null) {
                Toast.makeText(this, R.string.download_error, Toast.LENGTH_LONG).show();
                return;
            }
            gestor.enqueue(solicitud);
            Toast.makeText(this, R.string.download_started, Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, R.string.download_error, Toast.LENGTH_LONG).show();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_ALMACENAMIENTO) return;

        boolean concedido = grantResults.length > 0
            && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (concedido && descargaPendienteUrl != null) {
            descargar(descargaPendienteUrl, descargaPendienteNombre, descargaPendienteMime);
        } else {
            Toast.makeText(this, R.string.download_permission, Toast.LENGTH_LONG).show();
        }
        descargaPendienteUrl = null;
        descargaPendienteNombre = null;
        descargaPendienteMime = null;
    }

    /* [ETIQUETA: MENÚ SUPERIOR DE CAMBIO DE MODO (COLABORADOR / ADMIN)] */

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        getMenuInflater().inflate(R.menu.main_menu, menu);
        return true;
    }

    @Override
    public boolean onPrepareOptionsMenu(Menu menu) {
        boolean enWeb = webView.getVisibility() == View.VISIBLE && !errorMostrado;
        menu.findItem(R.id.accion_recargar).setVisible(enWeb);
        menu.findItem(R.id.accion_modo_colaborador).setVisible(enWeb);
        menu.findItem(R.id.accion_modo_admin).setVisible(enWeb);
        menu.findItem(R.id.accion_servidor).setVisible(enWeb);
        return super.onPrepareOptionsMenu(menu);
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        int id = item.getItemId();
        if (id == R.id.accion_recargar) {
            reintentarCarga();
            return true;
        }
        if (id == R.id.accion_modo_colaborador) {
            String base = urlRaiz(urlActual != null ? urlActual : URL_POR_DEFECTO);
            String destino = base + "/mi-turno";
            prefs.edit().putString(KEY_URL, destino).apply();
            cargarServidor(destino);
            return true;
        }
        if (id == R.id.accion_modo_admin) {
            String destino = urlRaiz(urlActual != null ? urlActual : URL_POR_DEFECTO);
            prefs.edit().putString(KEY_URL, destino).apply();
            cargarServidor(destino);
            return true;
        }
        if (id == R.id.accion_servidor) {
            mostrarSetup(null);
            return true;
        }
        if (id == R.id.accion_acerca) {
            mostrarAcercaDe();
            return true;
        }
        return super.onOptionsItemSelected(item);
    }

    private void mostrarAcercaDe() {
        String version = "";
        try {
            version = getPackageManager()
                .getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception ignored) {
            /* sin versión disponible */
        }

        String servidor = urlActual == null || urlActual.isEmpty()
            ? getString(R.string.acerca_sin_servidor)
            : urlActual;

        new AlertDialog.Builder(this)
            .setTitle(R.string.acerca_titulo)
            .setMessage(getString(R.string.acerca_mensaje, version, servidor))
            .setPositiveButton(android.R.string.ok, null)
            .show();
    }

    /* [ETIQUETA: NAVEGACIÓN CON BOTÓN ATRÁS DE ANDROID] */

    @Override
    public void onBackPressed() {
        if (errorOverlay.getVisibility() == View.VISIBLE) {
            mostrarSetup(null);
            return;
        }
        if (setupView.getVisibility() == View.VISIBLE) {
            super.onBackPressed();
            return;
        }
        if (webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }
}
