map $request_uri $proxy_uri {
  ~*/cbr/http://(.*)/(.+)$  "http://$1/$2";
  ~*/cbr/https://(.*)/(.+)$ "https://$1/$2";
  ~*/http://(.*)$       "http://$1/";
  ~*/https://(.*)$      "https://$1/";
  ~*/cbr/(.*)/(.+)$         "https://$1/$2";
  ~*/(.*)$              "https://$1/";
  default               "";
}
map $proxy_uri $proxy_origin {
  ~*(.*)/.*$ $1;
  default    "";
}

map $remote_addr $proxy_forwarded_addr {
  ~^[0-9.]+$        "for=$remote_addr";
  ~^[0-9A-Fa-f:.]+$ "for=\"[$remote_addr]\"";
  default           "for=unknown";
}

map $http_forwarded $proxy_add_forwarded {
  ""      "$proxy_forwarded_addr";
  default "$http_forwarded, $proxy_forwarded_addr";
}

server {
        root /var/www/astro3d.ru/html;
        index index.html index.htm index.nginx-debian.html;
        server_name astro3d.ru www.astro3d.ru;
 	listen 3000 ssl;  # Дополнительный порт
    listen [::]:443 ssl ipv6only=on; # managed by Certbot
    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/astro3d.ru/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/astro3d.ru/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
  sendfile                   on;
  tcp_nodelay                on;
  tcp_nopush                 on;
  
  etag                       off;
  if_modified_since          off;
  
  proxy_buffering            off;
  proxy_cache                off;
  proxy_cache_convert_head   off;
  proxy_max_temp_file_size   0;
  client_max_body_size       0;
  
  proxy_http_version         1.1;
  proxy_pass_request_headers on;
  proxy_pass_request_body    on;
  
  proxy_read_timeout         1m;
  proxy_connect_timeout      1m;
  reset_timedout_connection  on;
  
  proxy_redirect             off;
  resolver                   77.88.8.8 77.88.8.1 8.8.8.8 8.8.4.4 valid=1d;
  
  gzip                       off;
  gzip_proxied               off;
  # brotli                   off;

#location ~ ^/api/(create-calendar|calendar|calendar-events|calendar-events-filtered) {
location / {
    # 1. Разрешаем запросы с вашего локального хоста (или '*' для всех)
    add_header 'Access-Control-Allow-Origin' '$http_origin' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;
    add_header 'Access-Control-Expose-Headers' 'Content-Length,Content-Range' always;

    # 2. Ответ на preflight-запрос (OPTIONS)
    if ($request_method = 'OPTIONS') {
        add_header 'Access-Control-Allow-Origin' '$http_origin' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;
        add_header 'Access-Control-Max-Age' 1728000;
        add_header 'Content-Type' 'text/plain; charset=utf-8';
        add_header 'Content-Length' 0;
        return 204;
    }

    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
 location  /cbr/ {
#    try_files $uri $uri/ =404;    
#    add_header Content-Type text/plain;
#    return 200 "document_root: $document_root, host: $host, request_uri: $request_uri, proxy_uri: $proxy_uri ";
    if ($proxy_uri = "") {
      return 404;
    }

    location ~* \.(?:css)$ {
      add_header Cache-Control "max-age=60,  public";
    }

    location ~ astro2D.js$ {
      add_header Cache-Control "max-age=60,  public";
    }



    # add proxy cors
    add_header Access-Control-Allow-Headers "*" always;
    add_header Access-Control-Allow-Methods "*" always;
    add_header Access-Control-Allow-Origin  "*" always;

    if ($request_method = "OPTIONS") {
      return 204;
    }
    
    # pass client to proxy
    proxy_set_header Host                $proxy_host;
    proxy_set_header Origin              $proxy_origin;
    proxy_set_header X-Real-IP           $remote_addr;
    proxy_set_header X-Client-IP         $remote_addr;
    proxy_set_header CF-Connecting-IP    $remote_addr;
    proxy_set_header Fastly-Client-IP    $remote_addr;
    proxy_set_header True-Client-IP      $remote_addr;
    proxy_set_header X-Cluster-Client-IP $remote_addr;
    proxy_set_header X-Forwarded-For     $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto   $scheme;
    proxy_set_header Forwarded           "$proxy_add_forwarded;proto=$scheme";
    
    # hide original cors
    proxy_hide_header Access-Control-Allow-Credentials;
    proxy_hide_header Access-Control-Allow-Headers;
    proxy_hide_header Access-Control-Allow-Methods;
    proxy_hide_header Access-Control-Allow-Origin;
    proxy_hide_header Access-Control-Expose-Headers;
    proxy_hide_header Access-Control-Max-Age;
    proxy_hide_header Access-Control-Request-Headers;
    proxy_hide_header Access-Control-Request-Method;
    
    proxy_pass $proxy_uri;
  }

  }

server {
    if ($host = www.astro3d.ru) {
        return 301 https://$host$request_uri;
    } # managed by Certbot


    if ($host = astro3d.ru) {
        return 301 https://$host$request_uri;
    } # managed by Certbot


        listen 80;
        listen [::]:80;
        server_name astro3d.ru www.astro3d.ru;
    return 404; # managed by Certbot
}